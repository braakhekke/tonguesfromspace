# Sources ledger: Switzerland / Findelgletscher (SGI B56-03, GLAMOS name Findelgletscher)

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in the glacier's record `data/regions/ch/`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=B56-03, GLAMOS name Findelgletscher`, files in `B56-03, GLAMOS name Findelgletscher/`). Only what was opened is stated as read; the rest is under NOT READ. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Findel has:** its own GLAMOS elevation-band balance (`massbalance_fixdate_elevationbins.csv`, 315 rows of B56-03, newest years from 2500 m), so no donor is needed (`donor: own`); stake readings (`findelen_annual.dat`, `findelen_intermediate.dat`, `findelen_winter.dat`: the GLAMOS point files are named `findelen_*`, not after the site id); radar surveys of 2008, 2012 and 2017. A lake lies in front of the tongue (js/11-view3d.js `LAKE_GLACIERS`): the surfaces keep the cells outside the 2023 outline at the newest elevation model.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint
- Where: `volumechange_2025_r2025_series.csv`: the surface named `sa3d-2023` there ends 20159999 (survey 2015, day unknown): `ai-bw` to `sa3d-2023`, 20070913 to 20159999, dV -0.039807 km3; `sa3d-2023` to `is-stand`, 20159999 to 20230823, A 13.8689 km2 (2015) to 13.1654 km2 (2023), dV -0.148357 km3. The all-combinations file names the same surface `sa3d-2018` (e.g. `sa3d-2018` to `is-stand`, 20159999 to 20230823, dV -0.148350 km3). The page quotes the series file.
- Dates (exact wording): "20159999" = survey 2015, day unknown (9999 placeholder); `is-stand` = 20230823.
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial. Read: yes (rows of B56-03).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 96 rows of B56-03; last rows `2021-08-14` to `2022-07-15` -49.70 m; `2022-07-15` to `2023-08-21` -75.90 m; `2023-08-21` to `2024-08-20` -54.60 m (observer "VAW/ETHZ; Andreas Bauder"). Overlapping rows from two observers were **not checked** (runbook step 12). Same licence. Read: last rows only.

### GLAMOS annual mass balance per elevation band, release 2025 — role: band balance of the model
- `massbalance_fixdate_elevationbins.csv` (doi 10.18750/massbalance.2025.r2025), rows of B56-03; the newest years start at 2500 m. 2026 is not in release 2025: ESTIMATED by `shape.py` (each band regressed on the glacier-wide Bw and Bs of Grosser Aletsch, 2005 to 2025, evaluated at the Aletsch 2026 values read from the GLAMOS figure: Bw +751.6, Bs -3790.0 mm w.e., about +-100 mm w.e.). Licence: non-commercial. Read: yes.

### swissALTI3D 2019 edition (A1) and 2024 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles. A2 from the newest edition of each tile (`newest_tile`, which tries 2026 downwards): the 2024 edition on all 30,912 ice cells (computed).
- Survey days, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): A1 (2015): 2015-08-05 CRYOSPHERE MONITORING (53.9 % of the ice cells), 2015-08-26 TLM (42.6 %), 2015-09-20 TLM (100 %) (computed); A2 (2023): 2023-08-21 CRYOSPHERE MONITORING (36.1 %), 2023-09-07 SWISSIMAGE (100 %). The pair rule (lowest ICESat-2 rmse; pairs within 0.05 m tie, the GLAMOS date `2023-08-23` is not among them, so the strip covering most ice breaks the tie) gives A1 2015-09-20 and A2 2023-08-21 (best rmse 2.210 m; ties with 2015-08-05 and 2015-08-26 at 2.218 and 2.215 m).
- Licence: swisstopo OGD terms (read 2026-10-30, Aletsch ledger). **NOT READ:** the swisstopo product page for the editions.

### swissSURFACE3D (lidar) — role: constraint (anchor L)
- Raster tiles: 2022 on 66 % and 2021 on 34 % of the 2023-ice cells (computed, `a2_lidar_check.py`). GPS times of the LAS point clouds of the 11 tiles flown 2021 read (computed, `lidar_dates.json`): all on 2021-09-24. A2 is **not** a lidar surface (median difference 6.38 m to the 2021 tiles, 2.08 m to the 2022 tiles; no 2023 or later lidar edition lies over the ice).
- Licence as swisstopo OGD. Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check and choice of the survey days
- 49 granules with good shots in the box, 9 used, 50,718 good shots in the box, 1,228 on 2023 ice July to October (slope under 20 degrees, quality 0, h_li_sigma under 1 m). Datum: the usual plane on stable rock, 20,586 shots, NMAD 1.27 m (standard fit). rmse 2.21 m over all years (leave-one-granule-out and with the days used, which are the days of the pair rule), bias +0.67 m; per year (leave-one-granule-out) 2019 2.72 m (172 shots), 2020 2.23 (204), 2021 1.73 (207), 2023 0.68 (55), 2025 2.28 (590). The 2023 anchor year has fewer than 100 shots, so the anchor sigma (1.73 m) is the rmse of 2021, the year with the lowest rmse among those with at least 100 shots: an upper bound, said so on the page.
- Licence: NASA open data; used for checking only. Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 102 scenes over the strip, July to October 2016 to 2026; 14 passed the gate (rock NMAD at most 15 m; at least 300 rock and 200 ice cells); NMAD range 9.3 to 14.5 m; years 2016 to 2021 and 2024. Licence: **NOT READ** (ASTER terms of use).

### GLAMOS point mass balance (stakes), release 2025 — check
- `findelen_annual.dat` etc.: 101 stake-years on modelled ice inside the 2023 outline after the first survey (type 1); the modelled surface change is 0.76 of the stake reading on average (RMSE 1.21 m), by year 0.53 (2020) to 1.09 (2023) (computed, `stake_check.json`). Licence: file headers "scientific and non-commercial use". Read: yes.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `B56-03_findelen_GlaThiDa.txt` (15,218 lines) and `B56-03_findelen_SCCER.txt` (15,576 lines). In the strip: 30,754 radar points (2017: 15,556; 2012: 12,823; 2008: 2,375). Checks: 2,334 cells, median -0.4 m (radar bed minus model bed); 93 spots with two survey dates (2012 and 2017: 89; 2008 and 2012: 4), median +3.6 m, standard deviation 19.4 m; ice-free ground: 1,072 points (2012: 407; 2017: 665) on 6 flight profiles, radar bed +4.6 m and model bed +4.3 m against the ground now (medians), 82 % of the points with the radar bed above the ground. `B56-03/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed
- As `docs/sources/ch-swissbedrock.md`: under glaciers swissALTI3D minus the modelled GLAMOS 2020 thickness. Always the bed of the surfaces and the viewer (owner, 2026-11-02).

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 and the 2023 outline of the record; area in the glacier list as stated above. Read: yes.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the editions; the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers, airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page), other point data, national and cantonal sources.

## Findings that shaped the run (computed, 2026-11-02)
- The GLAMOS point files are named `findelen_*`; the first stake check read nothing because it looked for the site id. Fixed (`cfg.STAKE_SLUG`); 101 stake-years found.
- Fit: rmse 2.21 m (bias +0.67 m, model minus shot); the model sits above the shots in 2020 (+1.06 m), 2021 (+0.94 m), 2023 (+0.55 m) and 2025 (+0.91 m) and below them in 2019 (-0.89 m); no steady trend.

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Sold, Huss, Machguth, Joerg, Leysinger Vieli, Linsbauer, Salzmann, Zemp, Hoelzle (2016), "Mass Balance Re-analysis of Findelengletscher, Switzerland; Benefits of Extensive Snow Accumulation Measurements", Frontiers in Earth Science 4, doi:10.3389/feart.2016.00018** — 10-year mass balance series, helicopter-borne GPR snow accumulation, model result about -0.43 m w.e. a-1 for 2004 to 2014 (Findelengletscher) and -0.30 for Adlergletscher. Read: the abstract page.
- **Feiger, Huss, Leinss, Sold, Farinotti (2018), "The bedrock topography of Gries- and Findelengletscher", Geographica Helvetica 73, 1-9, doi:10.5194/gh-73-1-2018** — GPR of 26 and 28 February and 19 March 2015 (25 km), plus VAW 2008 helicopter GPR and University of Zurich and Fribourg 2012 data; ITEM interpolation; Findelengletscher volume 1.00 +- 0.34 km3, average thickness 56.3 +- 19.6 m, maximum about 185 m (17.4 km2 basin). Read: the abstract page. Role: independent bed and thickness (the GLAMOS 2020 model used here predates it).
- **Joerg et al. (2010), EGU abstract, airborne laser scanning at Findelgletscher** (2005 to 2009 surface change): pointer, **NOT READ**. A study of historical maps of the Zermatt region 1859 to 2010 (thickness loss rate): pointer, **NOT READ**.

**What round 1 did not find:** no newer airborne DEM than swissALTI3D and swissSURFACE3D; the University of Fribourg and Zurich glaciology groups' data repositories were not searched by name.

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 389. front_variation: 109 rows, 1881-07-02 to 2024-08-20; mass_balance: 21 years (2005 to 2025); mass_balance_band: 315 rows (2005 to 2025, the same count as the GLAMOS band file); mass_balance_point: 1,477 rows (2005 to 2025); state: 29 rows 1859 to 2018; change: 21 records, among them airborne laser scanning 2005-10-28 to 2009-10-04 and 2009-10-04 to 2010-09-29 (Jörg; elevation change -2.368 m and -0.959 m as the file states them), Bossard 2005-07-02 to 2009-07-02 and Hugonnet et al. 1999 to 2019.

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/B56-03.json, rebuilt: identical): the page's card value (running median along the 123-point flowline, highest point) is 11 to 28 m/yr over 2013 to 2024.

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1930-08-28, 20.09 km2 (computed); SGI2010 14.2 km2; SGI2016 13.86 km2 (attribute, year_acq 2015).

**GLAMOS stakes (2026-11-03):** stake check (`findelen_*.dat`): 101 stake-years 2016 to 2025, modelled change = 0.76 of the reading, RMSE 1.21 m (computed; check only). The viewer now carries the GLAMOS point records as markers (145 in the crop, `build_viewer.py` `stake_markers()`). Zmutt, Unteraar, Fee and Trift have no GLAMOS point files, so their viewers have none.
