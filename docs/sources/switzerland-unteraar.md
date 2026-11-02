# Sources ledger: Switzerland / Unteraargletscher (SGI A54g-11, GLAMOS name Unteraargletscher)

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in `data/regions/ch/unteraar/glacier.json`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=A54g-11`, files in `A54g-11/`). Only what was opened is stated as read; the rest is listed under NOT READ. Method and rules: `docs/YEARLY_DEM_METHOD.md`. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Unteraar does NOT have (checked):** GLAMOS release 2025 lists mass balance as not available for A54g-11 (glacier list row `Unteraargletscher,A54g-11,2657374,1157798,20.364,2024,1,0,1`: length change 1, mass balance 0, volume change 1); no row of A54g-11 in `massbalance_fixdate_elevationbins.csv` or `massbalance_fixdate.csv`. The point files hold stake readings only for 1997 to 1999 (see below), before the first survey. No swissSURFACE3D lidar of 2021 or 2022 lies over its ice (the tiles over the ice are the 2023 edition).

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint (which surfaces are the anchors)
- Where: `volumechange_2025_r2025_series.csv` and `..._allcombinations.csv`. Series rows of A54g-11 end with `ai-bw` to `is-stand`, 20090819 to 20230823, A 22.8684 km2 (2008) to 21.4630 km2 (2023), dV -0.609348 km3, dh_mean -26.601 m. The series file has **no** `sa3d-*` surface for this glacier; the all-combinations file does: `ai-bw` to `sa3d-2018`, 20090819 to 20129999 (dV -0.136988 km3), and `sa3d-2018` to `is-stand`, 20129999 to 20230823 (A 22.8096 km2 (2012) to 21.4630 km2 (2023), dV -0.472797 km3, dh_mean -20.693 m). The page quotes the all-combinations file.
- Dates (exact wording): "20129999" = survey 2012, day unknown (9999 placeholder); `is-stand` = 20230823. The 2012 surface is named `sa3d-2018` in this file.
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial.
- Read: yes (rows of A54g-11).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 125 rows of A54g-11 (`lengthchange.csv`); last rows `2020-09-04` to `2021-08-26` -21.00 m; `2021-08-26` to `2022-08-23` -35.10 m; `2022-08-23` to `2023-08-20` -15.60 m; `2023-08-20` to `2024-08-23` -15.10 m (observer "VAW/ETHZ; Andreas Bauder"). Same licence. Overlapping rows from two observers were **not checked** for this glacier (runbook step 12).
- Read: last rows only.

### swissALTI3D 2019 edition (A1) and 2025 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles: A1 from the 2019 edition tiles, A2 from the newest edition of each tile (`newest_tile`, which tries 2026 downwards): the 2025 edition on all 22,070 ice cells (computed). The 2025-edition surface over the ice **equals the swissSURFACE3D raster of 2023** (median absolute difference under 0.05 m on all 22 tiles with ice, computed by `a2_lidar_check.py`).
- Survey days of A1, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): 2012-08-18 TLM and 2012-08-27 CRYOSPHERE MONITORING both cover 100 % of the ice cells (computed). Chosen A1 day: 2012-08-27 (tie within 0.05 m with 2012-08-18, the strip covering most ice is equal; the pair rule's best pair was 2012-08-27 and 2023-08-20, rmse 3.227 m).
- Licence: swisstopo OGD terms (read 2026-10-30, see the Aletsch ledger): use, processing, commercial use allowed, source reference mandatory.
- Accuracy statement: not re-read for this glacier; the Aletsch ledger quotes Bannwart et al. ("0.5 m below 2000 m a.s.l. and 1-3 m above").
- Read: tile files and strip layer; **NOT READ:** the swisstopo product page for the 2019 and 2025 editions (edition years are the names of the downloaded tiles, not a statement of swisstopo).

### swissSURFACE3D (lidar) — role: constraint (A2 day)
- Raster tiles over the ice: 2023 edition on all 22 tiles with ice (the HEAD requests for the 2021, 2022, 2024 and 2025 editions answered 200 for none of the tested tiles; 2023 for all six tested). GPS times of the LAS point clouds of **all 22 tiles with ice** read (computed): 20 tiles flown only on 2023-07-11; tile 2656-1159 on 2023-07-11 (99.9 % of its points) and 2023-08-10 (0.1 %); tile 2655-1160 (119 ice cells) on 2023-07-11 (71.2 %) and 2023-08-10 (28.8 %). `A54g-11/a2_lidar_days.json`.
- Role: its flight day, 2023-07-11, is the day of A2 (the best strip day of 2023 chosen by the pair rule, 2023-08-20, lay 40 days later). Licence as swisstopo OGD.
- Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check and choice of the A1 day
- 68 granules over the strip, 15 used (46 granules with good shots in the box), 26,181 good shots in the box, 1,912 on 2023 ice July to October (slope under 20 degrees, quality 0, h_li_sigma under 1 m). Datum: the usual plane on stable rock scattered by 2.21 m (NMAD, 5,895 shots), over the 2 m limit, so the datum exception applies: offset 52.73 m from 696 gentle rock shots within 1,500 m of the ice (NMAD 0.82 m). Result with Rhone bands: rmse 3.23 m over all years (leave-one-granule-out), 3.12 m with the days used; 2023 anchor year 1.89 m (leave-one-granule-out).
- Licence: NASA open data; used for checking only.
- Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 63 scenes over the strip, July to October 2016 to 2026; 3 passed the gate (rock NMAD at most 15 m; at least 300 rock and 200 ice cells): 2019 (1 scene, mean 4.5 m) and 2020 (2 scenes, mean 1.6 m); NMAD range 9.7 to 13.2 m.
- Licence: **NOT READ** (ASTER terms of use were not read, as for the other glaciers).

### GLAMOS point mass balance (stakes), release 2025 — role: check (none possible)
- `unteraar_annual.dat` (113 readings, 1997 to 1999, 2141 to 2560 m a.s.l.) and `unteraar_intermediate.dat` (19 lines; 15 readings dated 1999). No winter file. None after the first survey (2012), so no stake check.
- Licence: file headers "scientific and non-commercial use". Read: yes.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `A54g-11_unteraar_GlaThiDa.txt` (13,538 lines) and `A54g-11_unteraar_vaw-archiv.txt` (17,058 lines). Reference in the file header: Bauder, Funk and Gudmundsson (2003), Annals of Glaciology 37, 331-336. In the strip: 12,641 radar points (2012: 11,557; 2002: 1,084). Checks: 1,393 cells, median -2.1 m (radar bed minus model bed); 22 spots with two survey dates (2002 and 2012), median -15.6 m, standard deviation 15.7 m; ice-free ground: 98 points on 3 flight profiles, radar bed -2.6 m and model bed +1.5 m against the ground now (medians). `A54g-11/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened for this glacier). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed (the floor of the surfaces and the bed of the viewer)
- As the swissBEDROCK ledger (`docs/sources/ch-swissbedrock.md`): under glaciers it is swissALTI3D minus the modelled GLAMOS 2020 thickness. Read: see that ledger.

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 (`SGI_2016_glaciers.shp`) and the 2023 outline of the record; area 20.364 km2 in the glacier list. Read: yes (files).

## Findings that shaped the run (all computed here, 2026-11-02)
- A2 is a lidar surface flown 2023-07-11; the strip-day rule (best of 2023-08-20, -08-22, -09-05) put it 40 days late and left a large anchor-year offset. Fixed by using the lidar day (`params.json` `a2_lidar`).
- The standard datum fit scattered by 2.21 m on this glacier; the per-glacier datum exception (rock NMAD over 2.0 m) was added to `gval.py` (owner, 2026-11-02).
- No band balance of its own: the donor, among the candidates covering at least 98 % of the 2023 ice cells, is the Rhone (rmse 3.12 m; Aletsch 3.55 m; Corbassiere 3.00 m and the borrowed line 3.26 m cover only 75 to 76 % and are not eligible; Findel covers 3 %). The error grows with time (2020 and 2021 about -2.9 m, 2025 about +3.9 m, model minus shot, with the datum exception): the borrowed bands do not reproduce the timing of this glacier.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the swissALTI3D 2019 and 2025 editions and swissSURFACE3D 2023 (edition dates and accuracy for this region); the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers about Unteraargletscher beyond Bauder et al. (2003) (e.g. the long ETH/VAW research record), airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page, not searched here), other stake or point data, national and cantonal sources.

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Bauder, Funk, Gudmundsson (2003), "The ice-thickness distribution of Unteraargletscher, Switzerland", Annals of Glaciology 37, 331-336** — radar ice thickness, the source behind the GLAMOS radar files used here. Read: the file header's reference line only; the paper was **not** opened (a search result for it exists on cambridge.org).
- **Fischer, Braun, Bauder, Flowers (2005), "Changes in geometry and subglacial drainage derived from digital elevation models: Unteraargletscher, Switzerland, 1927-97", Annals of Glaciology 40, doi:10.3189/172756405781813528** — surface DEMs of 1927, 1947, 1961 and 1997 (digitised from maps or photogrammetric), bed DEM. Pointer, **NOT READ** (the PDF could not be read; title, authors and DOI are the search tool's statement). Role: older DEMs, not used (the GLAMOS volume-change tables already hold the 1927 to 2023 surfaces).
- **Huss, Sugiyama, Bauder, Funk (2007), "Retreat scenarios of Unteraargletscher, Switzerland, using a combined ice-flow mass-balance model", Arctic, Antarctic, and Alpine Research 39(3)** — velocity measurements 1989 to 2001, mass balance from repeated DEMs. Pointer, **NOT READ** (the page returned no text).
- **Gudmundsson and Bauder (1999), Geografiska Annaler; Gudmundsson et al. (2000), Journal of Glaciology** — mass-balance distribution from the kinematic boundary condition (about 40 stake measurements) and automated surface displacement from 1998. Pointers, **NOT READ**.
- **swisseduc.ch, Unteraargletscher excursion page** — read for the panel text (Hugi and Agassiz, Hôtel des Neuchâtelois); not a data source.

**What round 1 did not find:** no airborne research DEM beyond the GLAMOS and swisstopo surfaces, no stake series after 1999, no dated velocity product for 2016 to 2026.

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 450 (WGI id CH4R0144G011). front_variation: 231 rows, ends 1729-07-02 to 2024-08-23 (the GLAMOS length file used by the page has 125 rows from 1871: the rows before 1871 are only in WGMS); mass_balance, mass_balance_band and mass_balance_point: none (GLAMOS has stake readings 1997 to 1999 that WGMS does not hold); state: 24 rows 1969 to 2009; change: 19 records, among them Bauder air-photo volume change 2003-07-14 to 2009-08-19 and the Hugonnet et al. ASTER 5-year series 1999 to 2019 (elevation change -37.4 m for 1999-12-31 to 2019-12-31, as the file states it, area 23825000 in the file's unit).

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/A54g-11.json, rebuilt from the cached product: identical): the flowline (127 points) has values on 94 to 96 points; the page's card value (the running median along it, highest point) is 19, 21, 16, 19, 19, 15, 15, 14, 13, 14, 14 and 12 m/yr for 2013 to 2024, while single cells of the picture box reach 124 to 187 m/yr elsewhere (not on the flowline).

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1927-09-28, 29.26 km2 (geometry of the shapefile, computed); SGI2010 22.51 km2 (3 polygons, computed); SGI2016 22.7 km2 (attribute area_km2, year_acq 2016).
