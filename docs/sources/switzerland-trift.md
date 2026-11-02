# Sources ledger: Switzerland / Triftgletscher (BE) (SGI A54e-24, GLAMOS name Triftgletscher (BE))

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in the glacier's record `data/regions/ch/`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=A54e-24, GLAMOS name Triftgletscher (BE)`, files in `A54e-24, GLAMOS name Triftgletscher (BE)/`). Only what was opened is stated as read; the rest is under NOT READ. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Trift does NOT have (checked):** GLAMOS release 2025 lists mass balance as not available for A54e-24 (glacier list row `Triftgletscher (BE),A54e-24,2671989,1166738,12.883,2024,1,0,1`); no row of A54e-24 in `massbalance_fixdate_elevationbins.csv`; the point file `trift_intermediate.dat` holds readings of 2002 to 2003 only (a different glacier, Trift Weissmies, has its own `triftweissmies_intermediate.dat`: not used). The 2023 anchor year has no ICESat-2 shots on the ice.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint
- Where: `volumechange_2025_r2025_series.csv`: the surface named `sa3d-2023` there ends 20169999 (survey 2016, day unknown); series rows include `sa3d-2018` to `sa3d-2023`, 20109999 to 20169999, dV -0.054193 km3, and `sa3d-2019` to `is-stand`, 20169999 to 20240823 (A 14.5582 km2 (2016) to 12.8841 km2 (2024), dV -0.133765 km3); the all-combinations file also lists `sa3d-2019` to `is-stand`, 20169999 to 20210812, and `sa3d-2018` to `is-stand` to 20230823 (A 14.6476 km2 (2010) to 13.9397 km2 (2023), dV -0.174445 km3). Two swissALTI3D surfaces exist for this glacier in the GLAMOS tables (survey 2010 named `sa3d-2018`, survey 2016 named `sa3d-2019`); the run takes the 2019 edition = `sa3d-2019` = survey 2016, supported by the 2016-09-07 SWISSIMAGE strip that covers 100 % of the ice (computed). The newest GLAMOS `is-stand` surface of the series is 20240823 (outline year 2024), not A2: A2 is the 2023 lidar (below). The page quotes the series file for A1.
- Dates (exact wording): "20169999" = survey 2016, day unknown (9999 placeholder).
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial. Read: yes (rows of A54e-24).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 48 rows of A54e-24; last rows `2021-08-20` to `2022-07-16` -0.10 m; `2022-07-16` to `2023-08-20` -7.50 m; `2023-08-20` to `2024-08-23` -8.70 m (observer "VAW/ETHZ; Andreas Bauder"). Overlapping rows from two observers were **not checked** (runbook step 12). Same licence. Read: last rows only.

### swissALTI3D 2019 edition (A1) and 2025 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles. A2 from the newest edition of each tile (`newest_tile`): the 2025 edition on all 27,651 ice cells (computed). The 2025-edition surface over the ice **equals the swissSURFACE3D raster of 2023** (median absolute difference 0.0 m on all 23 tiles with ice, `a2_lidar_check.py`).
- Survey day of A1, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): 2016-08-08 CRYOSPHERE MONITORING (23.7 % of the ice cells), 2016-08-26 CRYOSPHERE MONITORING (22.7 %), 2016-09-07 SWISSIMAGE (100 %) (computed). The pair rule gives A1 2016-09-07 (best rmse 2.753 m; ties with 2016-08-08 and 2016-08-26 within 0.05 m, the strip covering most ice breaks the tie).
- Licence: swisstopo OGD terms (read 2026-10-30, Aletsch ledger). **NOT READ:** the swisstopo product page for the editions.

### swissSURFACE3D (lidar) — role: constraint (A2 day) and anchor L
- A2 day: the 2023 raster edition lies on all 23 tiles with ice; GPS times of the LAS point clouds of **all 23 tiles** read (computed, `A54e-24/a2_lidar_days.json`): all flown only on 2023-08-19. So the day of A2 is 2023-08-19; the best strip day of 2023 by the pair rule, 2023-08-20, lies one day later.
- Anchor L: the raster 2021 edition (the model's lidar anchor reads 2021 and 2022 tiles only); GPS times of the tiles read: 18 tiles mostly 2021-10-10 and 8 mostly 2021-10-11 (flown in October, snow can lie on the upper cells).
- Licence as swisstopo OGD. Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check
- 29 granules with good shots in the box, 7 used, 13,948 good shots in the box, 465 on 2023 ice July to October. Datum: the usual plane on stable rock, 2,412 shots, NMAD 1.96 m (just under the 2 m limit: standard fit). With the borrowed line: rmse 2.75 m over all years, bias +2.36 m (model minus shot); per year 2019 1.53 m (40 shots), 2020 3.71 (41), 2021 2.77 (163), 2024 3.61 (54), 2025 2.33 (167). No shots of 2023 on the ice; the anchor sigma (2.30 m) is the rmse of 2025, the year with the lowest rmse among those with at least 100 shots: an upper bound, said so on the page.
- Licence: NASA open data; used for checking only. Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 46 scenes over the strip; 1 passed the gate (2021, rock NMAD 13.3 m). Licence: **NOT READ** (ASTER terms of use).

### GLAMOS point mass balance (stakes), release 2025 — none usable
- `trift_intermediate.dat` holds readings of 2002 to 2003 only, before the first survey (2016). No stake check possible.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `A54e-24_trift_GlaThiDa.txt` (16,984 lines) and `A54e-24_trift_vaw-archiv.txt` (14,304 lines). In the strip: 30,109 radar points (2008: 16,205; 2012: 13,862; 2002: 42). Checks: 2,027 cells, median -0.4 m (radar bed minus model bed); 80 spots with two survey dates (2008 and 2012: 68; 2002 and 2012: 8; 2002 and 2008: 3; all three: 1), median +4.7 m, standard deviation 11.3 m; ice-free ground: 166 points (2008) on 1 flight profile, radar bed -4.7 m and model bed -1.9 m against the ground now (medians), 22 % of the points with the radar bed above the ground. `A54e-24/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed
- As `docs/sources/ch-swissbedrock.md`: under glaciers swissALTI3D minus the modelled GLAMOS 2020 thickness. Always the bed of the surfaces and the viewer (owner, 2026-11-02).

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 and the 2023 outline of the record; area in the glacier list as stated above. Read: yes.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the editions; the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers, airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page), other point data, national and cantonal sources.

## Findings that shaped the run (computed, 2026-11-02)
- A2 is a lidar surface flown on one day, 2023-08-19 (one day before the best strip day): the A2 day is the lidar day (`params.json` `a2_lidar`).
- No band balance of its own: among the candidates covering at least 98 % of the 2023 ice cells the lowest ICESat-2 rmse is the borrowed straight line (2.75 m; Aletsch 2.89 m, Corbassière 2.91 m, Rhone 3.41 m; Findel 2.73 m covers 94 %: not eligible).
- The model sits above the ICESat-2 shots in every year with shots (bias +0.6 to +3.5 m, model minus shot), about +2.4 m overall; the rock NMAD of the datum fit (1.96 m) is just under the 2 m limit of the datum exception. The cause was not found.

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Dalban Canassy, Bauder, Dost, Fäh, Funk, Margreth, Müller, Sugiyama (2011), "Hazard assessment investigations due to recent changes in Triftgletscher, Bernese Alps, Switzerland", Natural Hazards and Earth System Sciences 11(8), 2149-2162, doi:10.5194/nhess-11-2149-2011** — geodetic volume measurements since 1929, calving-driven retreat 2000 to 2006, ice avalanche and impulse wave modelling, photographic monitoring. Read: the abstract page (the DEMs and dates used are in the full PDF, **NOT READ**).
- **swisseduc.ch, Triftgletscher page** and a glacier-change blog on the lake formation 2000 to 2008: pointers, **NOT READ**.
- **plattformj.ch (8 February 2006)** — read for the panel text: 216 m retreat in 2004/05.

**What round 1 did not find:** a VAW/ETH ice-thickness or bed-topography paper specific to Trift (only the GLAMOS radar of 2002, 2008 and 2012 is used), a GLAMOS mass balance or stakes after 2003, and any velocity product for the lake period.

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 446 ("TRIFT (GADMEN)"). front_variation: 60 rows, 1892-07-01 to 2024-08-23 (GLAMOS 48); no mass balance, band or point records; state: 11 rows 1973 to 2010; change: 22 records, among them Bauder air photo 2003-09-04 to 2008-09-09 and 2008-09-09 to 2013-08-22, and Hugonnet et al. 1999 to 2019.

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/A54e-24.json, rebuilt: identical): the page's card value (running median along the 71-point flowline) falls from 74 (2014) to 43 m/yr (2024); 2013 (82 m/yr) is left out by the page's 90 % rule.

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1928-09-14, 18.07 km2 (computed); SGI2010 14.91 km2; SGI2016 14.56 km2 (attribute, year_acq 2016).
