# Sources ledger: Switzerland / Glacier de Corbassière (SGI B83-03, GLAMOS name Glacier de Corbassière)

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in `data/regions/ch/corbassiere/glacier.json`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=B83-03`, files in `B83-03/`). Only what was opened is stated as read; the rest is under NOT READ. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Corbassière has:** its own GLAMOS elevation-band balance (`massbalance_fixdate_elevationbins.csv`, rows of B83-03, newest years from 2300 m), so no donor is needed (`donor: own`); stake readings in the annual point file (57 stake-years on modelled ice after the first survey); radar surveys of 1988, 1998 and 2011.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint (which surfaces are the anchors)
- Where: `volumechange_2025_r2025_series.csv` (rows of B83-03 end with `is-stand` to `is-stand`, 20170905 to 20230823, A 14.9435 km2 (2017) to 14.0741 km2 (2023), dV -0.119893 km3, dh_mean -8.013 m) and `..._allcombinations.csv`, which names the swissALTI3D surfaces: `sa3d-2018` (date_end 20109999, survey 2010) and `sa3d-2019` (date_end 20169999, survey 2016), e.g. `sa3d-2019` to `is-stand`, 20169999 to 20230823, A 14.9541 km2 (2016) to 14.0740 km2 (2023), dV -0.151047 km3, dh_mean -10.097 m. The run's A1 is the 2019 edition = `sa3d-2019` = survey 2016; the page quotes the all-combinations file.
- Dates (exact wording): "20169999" = survey 2016, day unknown (9999 placeholder); `is-stand` = 20230823.
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial.
- Read: yes (rows of B83-03).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 81 rows of B83-03; last rows `2016-09-29` to `2017-09-05` -17.20 m; `2017-09-05` to `2020-08-21` -118.30 m; `2020-08-21` to `2023-09-07` -134.00 m (observer "VAW/ETHZ; Andreas Bauder"). Overlapping rows from two observers were **not checked** (runbook step 12). Same licence. Read: last rows only.

### GLAMOS annual mass balance per elevation band, release 2025 — role: band balance of the model
- `massbalance_fixdate_elevationbins.csv` (doi 10.18750/massbalance.2025.r2025), rows of B83-03 for 1997 to 2025; the newest years start at 2300 m (earlier years from 2200 m, computed). 2026 is not in release 2025: ESTIMATED by `shape.py` (each band regressed on the glacier-wide Bw and Bs of Grosser Aletsch, 2005 to 2025, evaluated at the Aletsch 2026 values read from the GLAMOS figure: Bw +751.6, Bs -3790.0 mm w.e., about +-100 mm w.e.). Licence: non-commercial. Read: yes.

### swissALTI3D 2019 edition (A1) and 2024 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles. A2 from the newest edition of each tile (`newest_tile`, which tries 2026 downwards): the 2024 edition on all 30,371 ice cells (computed).
- Survey days, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): 2016-08-25 TLM covers 100 % of the ice cells (computed), the only strip of 2016 over the ice; 2023-09-07 SWISSIMAGE covers 100 % (computed), the only one of 2023. Both are the A1 and A2 days; `gval.py` confirmed them (pair rmse 1.593 m).
- Licence: swisstopo OGD terms (read 2026-10-30, Aletsch ledger): commercial use allowed, source reference mandatory.
- Accuracy statement: not re-read for this glacier (Aletsch ledger quotes Bannwart et al., "0.5 m below 2000 m a.s.l. and 1-3 m above").
- Read: tile files and strip layer. **NOT READ:** the swisstopo product page for the editions (edition years are the tile names found by the script).

### swissSURFACE3D (lidar) — role: constraint (anchor L)
- Raster 2021 edition on all ice (27 tiles with ice). GPS times of the LAS point clouds read (computed, `lidar_dates.json`): 11 tiles mostly 2021-09-24, 11 tiles mostly 2021-09-22, 4 tiles mostly 2021-10-10 and 1 tile mostly 2021-10-08. The model applies its rule per tile (day with at least 85 % of the points, else the point-weighted mean day when all days with over 2 % lie within 60 days, else no lidar). A2 is **not** this lidar (median difference to the 2024-edition surface 5.04 m, `a2_lidar_check.py`).
- Licence as swisstopo OGD. Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check
- 41 granules with good shots in the box, 18 used, 50,025 good shots in the box, 4,033 on 2023 ice July to October (slope under 20 degrees, quality 0, h_li_sigma under 1 m). Datum: the usual plane on stable rock, 12,588 shots, NMAD 1.47 m (under the 2 m limit: standard fit). rmse 1.59 m over all years (leave-one-granule-out and with the days used), bias +0.85 m; per year 2018 3.23 m (202 shots), 2019 1.71, 2020 1.96, 2021 1.39, 2022 1.54, 2023 1.34 (1,151 shots), 2024 0.68, 2025 1.33.
- Licence: NASA open data; used for checking only. Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 131 scenes over the strip, July to October 2016 to 2026; 13 passed the gate (rock NMAD at most 15 m; at least 300 rock and 200 ice cells), years 2016, 2017, 2018, 2019, 2020, 2022 and 2024; NMAD range 9.7 to 14.7 m.
- Licence: **NOT READ** (ASTER terms of use).

### GLAMOS point mass balance (stakes), release 2025 — check
- `corbassiere_annual.dat`: 57 stake-years on modelled ice inside the 2023 outline after the first survey (type 1); the modelled surface change is 0.78 of the stake reading on average (RMSE 0.79 m), by year 0.68 to 0.85 (computed, `stake_check.json`). Licence: file headers "scientific and non-commercial use". Read: yes.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `B83-03_corbassiere_GlaThiDa.txt` and `B83-03_corbassiere_vaw-archiv.txt`. In the strip: 28,544 radar points (2011: 28,280; 1998: 190; 1988: 74). Checks: 1,885 cells, median -0.7 m (radar bed minus model bed); 76 spots with two survey dates (1998 and 2011: 26; 1988 and 2011: 50), median -6.0 m, standard deviation 20.3 m; ice-free ground: 279 points on 2 flight profiles (2011: 278), radar bed +10.0 m and model bed +7.0 m against the ground now (medians). `B83-03/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed
- As `docs/sources/ch-swissbedrock.md`: under glaciers swissALTI3D minus the modelled GLAMOS 2020 thickness. Always the bed of the surfaces and the viewer (owner, 2026-11-02).

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 (`SGI_2016_glaciers.shp`) and the 2023 outline of the record; area 14.077 km2 in the glacier list. Read: yes.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the editions; the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers, airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page), other stake or point data, national and cantonal sources.

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Ice Memory cores of the Corbassière (2018 and 2020), published in Nature Geoscience on 26 January 2024** (University of Fribourg, Paul Scherrer Institute, Ca' Foscari University of Venice, CNR): the search result's summary says warming made the glacier unusable as a climate archive; the drilling plan was to reach bedrock at about 80 m. Pointer (University of Fribourg news page), **NOT READ**. Role: context, not an elevation or mass source.
- **Master's thesis on the retreat of the Corbassière 1892 to 2018** (University of Verona and Ca' Foscari): pointer from a search, **NOT READ**; the title and author were not recorded.
- **NASA Earth Observatory, "A Climate Archive Melts"** (Landsat view of the Corbassière): pointer, **NOT READ**.

**What round 1 did not find:** no peer-reviewed ice-thickness, DEM or mass-balance study of the Corbassière beyond the GLAMOS records (own band balance, stakes, radar of 1988, 1998 and 2011) in a French and an English search; the cited Fribourg and EPFL/ETH publication lists were not searched by name.

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 366. front_variation: 81 rows, 1890-07-02 to 2023-09-07; mass_balance: 29 years (1997 to 2025); mass_balance_band: 231 rows (2015 to 2025; the GLAMOS file read for the model starts in 1997 and has more rows); mass_balance_point: 202 rows (1997 to 2025); state: 32 rows 1964 to 2018; change: 15 records, Bauder air photo 2003-08-02 to 2008-08-29 and 2008-08-29 to 2013-08-21, and Hugonnet et al. 1999 to 2019 (elevation change -19.42 m for 1999-12-31 to 2019-12-31, as the file states it).

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/B83-03.json, rebuilt: identical): the flowline has 77 points of which 43 have values; the page's card value (running median along it, highest point) is 9, 7 and 6 m/yr for 2013 to 2015 and falls under the card's 5 m/yr floor from 2016, so the card gives no fastest ice for 2016 to 2024, while single cells elsewhere in the box reach 72 to 147 m/yr. The flowline does not reach the faster ice upstream.

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1923-08-23, 18.98 km2 (computed); SGI2010 15.22 km2; SGI2016 14.95 km2 (attribute, year_acq 2016).

**ITS_LIVE flowline (2026-11-03):** the flowline ended at 4.6 km (25 slow steps) and the card was empty from 2016. `FLOW_SLOW_OWN` in `scripts/build_itslive.py` now lets the line run 60 slow steps for this glacier: 177 points (10.6 km), 90 valid cells in every year, card values 28, 18, 29, 23, 25, 26, 24, 29, 21, 21, 24, 24 m/yr for 2013 to 2024 (computed), the fastest point at 5 to 6 km from the tip. Tried for Zmutt (no change) and Unteraar (the line runs into a neighbouring glacier, peaks over 100 m/yr at 15 km): not used for them.

**GLAMOS stakes (2026-11-03):** stake check (`stakes_check.py`, `corbassiere_*.dat`) was run with the harmonised package: 57 stake-years 2017 to 2025, modelled change = 0.78 of the reading, RMSE 0.79 m (computed; check only, not in the fit). The viewer now carries the GLAMOS point records as markers (69 stake/camera markers in the crop, the Aletsch viewer's format, `build_viewer.py` `stake_markers()`).
