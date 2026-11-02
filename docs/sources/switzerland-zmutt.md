# Sources ledger: Switzerland / Zmuttgletscher (SGI B57-05, GLAMOS name Zmuttgletscher)

Search done: 2026-11-02, by Claude, for the yearly ice-surface run (runbook `docs/YEARLY_GLACIER_RUNBOOK.md`; strip of the walkthrough, tip and strip in `data/regions/ch/zmutt/glacier.json`). Local run: `experiments/swiss-yearly-dem/` (git-ignored; `GLACIER=B57-05`, files in `B57-05/`). Only what was opened is stated as read; the rest is under NOT READ. A first round of the wider data search of `docs/DATA_SEARCH.md` was done (section "Wider source search, round 1" at the end); it is not exhaustive.

**What Zmutt does NOT have (checked):** GLAMOS release 2025 lists mass balance as not available for B57-05 (glacier list row `Zmuttgletscher,B57-05,2614440,1093288,13.696,2023,1,0,1`: length change 1, mass balance 0, volume change 1); no row of B57-05 in `massbalance_fixdate_elevationbins.csv` or `massbalance_fixdate.csv`; no file of the annual, winter or intermediate point sets. A lake lies in front of the tongue (js/11-view3d.js `LAKE_GLACIERS`): the surfaces keep the cells outside the 2023 outline at the newest elevation model.

## Sources
### GLAMOS volume change, release 2025 (doi 10.18750/volumechange.2025.r2025) — geodetic — role: constraint
- Where: `volumechange_2025_r2025_series.csv`: the surface named `sa3d-2023` there ends 20159999 (survey 2015, day unknown); rows `is-stand` to `sa3d-2023`, 20100901 to 20159999, dV -0.066222 km3; the all-combinations file names the same surface `sa3d-2018`: `sa3d-2018` to `is-stand`, 20159999 to 20230823, A 14.8206 km2 (2015 outline) to 13.6962 km2 (2023), dV -0.157403 km3, dh_mean -10.612 m. The page quotes the series file.
- Dates (exact wording): "20159999" = survey 2015, day unknown (9999 placeholder); `is-stand` = 20230823.
- Licence: file header "scientific and non-commercial use"; landing page says CC BY 4.0. Stricter wins: non-commercial.
- Read: yes (rows of B57-05).

### GLAMOS length change (doi 10.18750/lengthchange.2025.r2025) — context
- 66 rows of B57-05; last rows `2013-08-21` to `2017-09-05` -100.00 m; `2017-09-05` to `2020-08-21` -134.00 m; `2020-08-21` to `2023-09-07` -104.10 m (observers "VAW/ETHZ; A. Andreas Bauder", "VAW/ETHZ; Andreas Bauder"). Overlapping rows from two observers were **not checked** (runbook step 12). Same licence. Read: last rows only.

### swissALTI3D 2019 edition (A1) and 2024 edition (A2) — DEM — role: constraint
- Where: data.geo.admin.ch tiles. A2 from the newest edition of each tile (`newest_tile`, which tries 2026 downwards): the 2024 edition on all 24,777 ice cells (computed).
- Survey days, from the swisstopo image strips (layer `ch.swisstopo.lubis-bildstreifen`, `strips_geom.json`): 2015-08-26 TLM covers 100 % of the ice cells (computed), the only strip of 2015 over the ice; 2023-09-07 SWISSIMAGE covers 100 % (computed), the only one of 2023. Both are the A1 and A2 days; `gval.py` confirmed them (pair rmse 3.127 m with the provisional Aletsch donor; one pair only).
- Licence: swisstopo OGD terms (read 2026-10-30, Aletsch ledger). Accuracy statement not re-read here. **NOT READ:** the swisstopo product page for the editions.

### swissSURFACE3D (lidar) — role: constraint (anchor L)
- Raster tiles: 2021 on 65 % and 2022 on 35 % of the 2023-ice cells (computed; the two tile years, `a2_lidar_check.py`). GPS times of the LAS point clouds of 14 tiles with ice read (computed, `lidar_dates.json`): 7 tiles hold at least 85 % of their points on one day (2021-08-24 on 4, 2022-08-23 on 3), 2 tiles take the point-weighted mean day, 5 are not used (days further apart than 60 days or not read). The lidar sits on 30 % of the ice cells (computed), so no lidar year counts as measured. A2 is **not** this lidar (median difference 3.91 m for 2021 tiles, 2.54 m for 2022 tiles).
- Licence as swisstopo OGD. Read: yes (point clouds read and deleted).

### ICESat-2 ATL06 v007 (NASA, via earthaccess) — altimetry — role: check
- 34 granules with good shots in the box, 8 used, 21,568 good shots in the box, 943 on 2023 ice July to October (slope under 20 degrees, quality 0, h_li_sigma under 1 m). Datum: the usual plane on stable rock, 5,072 shots, NMAD 1.66 m (under the 2 m limit: standard fit). With the Corbassière bands: rmse 2.29 m over all years (leave-one-granule-out and with the days used), bias +1.83 m; per year 2019 1.64 m (178 shots), 2020 3.05 (81), 2021 1.89 (152), 2022 2.24 (290), 2023 3.06 (90), 2024 1.44 (5), 2025 2.39 (147). The 2023 anchor year has fewer than 100 shots, so the anchor sigma (1.64 m) is the rmse of 2019, the year with the lowest rmse among those with at least 100 shots: an upper bound, said so on the page.
- Licence: NASA open data; used for checking only. Read: yes.

### ASTER AST14DEM (NASA LP DAAC) — check only
- 115 scenes over the strip, July to October 2016 to 2026; 21 passed the gate (rock NMAD at most 15 m; at least 300 rock and 200 ice cells); NMAD range 7.8 to 14.7 m; years 2016 to 2024.
- Licence: **NOT READ** (ASTER terms of use).

### GLAMOS point mass balance (stakes), release 2025 — none
- No point file for Zmutt (annual, winter or intermediate). No stake check possible.

### GLAMOS ice thickness release 2020 (doi 10.18750/icethickness.2020.r2020) — radar — role: bed check
- `B57-05_zmutt_GlaThiDa.txt` (13,466 lines) and `B57-05_zmutt_SCCER.txt` (6,470 lines; header: surface elevation by GNSS and laser altimeter from the GPR platform; investigators Grab, Schmid, Church, Bauder, Maurer; reference Grab et al. (2021)). In the strip: 19,308 radar points (2012: 12,858; 2017: 6,450). Checks: 1,246 cells, median -0.4 m (radar bed minus model bed), 92 % within 10 m; 51 spots with two survey dates (2012 and 2017), median -1.4 m, standard deviation 13.7 m; ice-free ground: 289 points (all 2012) on 1 flight profile, radar bed +5.6 m and model bed +2.3 m against the ground now (medians), 75 % of the points with the radar bed above the ground. `B57-05/bed_check.json`.
- Licence: CC BY 4.0 per the landing page (not re-opened). Read: yes (files).

### swissBEDROCK (swisstopo) — model bed
- As `docs/sources/ch-swissbedrock.md`: under glaciers swissALTI3D minus the modelled GLAMOS 2020 thickness. Always the bed of the surfaces and the viewer (owner, 2026-11-02).

### SGI outlines (GLAMOS), 2016 and 2023 — context
- SGI2016 and the 2023 outline of the record; area 13.696 km2 in the glacier list. Read: yes.

## Findings that shaped the run (computed, 2026-11-02)
- No band balance of its own: the donor, among the candidates covering at least 98 % of the 2023 ice cells, is Corbassière (rmse 2.29 m; Aletsch 3.13 m, Rhone 3.43 m; Findel 2.04 m covers 83 % and the borrowed line 2.46 m covers 97 %: not eligible).
- The model sits above the ICESat-2 shots in 2019 to 2023 and 2025 (bias +0.9 to +2.8 m, model minus shot, leave-one-granule-out), including the 2023 anchor year (+2.8 m, 90 shots); 2024 has only 5 shots. The cause was not found.

## NOT READ / not searched (left for the owner)
- ASTER AST14DEM terms of use; the swisstopo pages for the editions; the GLAMOS landing pages of the licences quoted above.
- Not searched yet (`docs/DATA_SEARCH.md`): papers, airborne research DEMs, ice speed (ITS_LIVE annual maps are used by the page), other point data, national and cantonal sources.

## Wider source search, round 1 (2026-11-02, `docs/DATA_SEARCH.md`)
Web searches in English and the local language(s), each followed by opening the main hits. **Read** = the page or abstract was opened and read in this session; **pointer** = a search result only (title, authors and DOI as the search stated them), **NOT READ**. Round 1 is not exhaustive: WGMS Fluctuations of Glaciers (metadata, investigators, WGMS_ID), ITS_LIVE and other velocity products, Hugonnet-type geodetic compilations, historical maps (Siegfried, Dufour) and the cantonal and municipal archives were **not** searched for this glacier yet.

- **Mölg, Bolch, Walter, Vieli (2019), "Unravelling the evolution of Zmuttgletscher and its debris cover since the end of the Little Ice Age", The Cryosphere 13(7), 1889-1909, doi:10.5194/tc-13-1889-2019** — debris cover 13 % to 32 % since 1859; length and area changes small and delayed; glacier-wide mass balance comparable to debris-free glaciers. Read: the abstract (cited in the panel text).
- **Mölg et al. (2019), PANGAEA, "Zmuttgletscher flow velocity, debris cover thickness and ablation measurements during 2017", doi:10.1594/PANGAEA.904043 (children 904041 and 904042)** — two UAV DEMs with orthophotos, surface flow velocities by feature tracking, debris thickness and ablation, 5 July to 22 August 2017; licence CC BY 4.0. Read: the dataset page (acquisition dates and resolution of the DEMs are not on that page). Role: possible validation for velocity and debris, not used.
- **Mölg, Ferguson, Bolch, Vieli (2020), Geomorphology**, surface morphology over 140 years: pointer, **NOT READ**. A University of Zurich master's thesis on the debris cover of the tongue: pointer, **NOT READ**.
- **Grande Dixence SA, Stafel and Z'Mutt pumping stations pages** — read for the panel text (the Zmutt glacier's meltwater feeds the Stafel station).

**What round 1 did not find:** no ice-thickness study beyond the GLAMOS radar (2012, 2017) and no mass-balance series (GLAMOS has none).

## Wider source search, round 2 (2026-11-03): WGMS records, velocity products, historical maps
**WGMS Fluctuations of Glaciers database**, version 2026-02-10 (doi:10.5904/wgms-fog-2026-02-10; the zip of wgms.ch was downloaded and the CSV tables glacier, front_variation, mass_balance, mass_balance_band, mass_balance_point, state and change were read; counts below are from those files, values are quoted as the files state them, their units were not re-checked against the FoG readme): WGMS id 390. front_variation: 62 rows, 1893-07-02 to 2023-09-07; no mass balance, band or point records; state: 26 rows 1962 to 2010; change: 7 records, among them airborne laser scanning 2005-07-02 to 2009-07-02 (Bossard; elevation change -5.62 m as the file states it) and Hugonnet et al. 1999 to 2019 (-21.48 m).

**Other velocity products (round 2):** Rabatel, Ducasse, Millan, Mouginot, "Annual glacier surface flow velocity product from Sentinel-2 data for the European Alps", V1, 2023, doi:10.57745/XHQ7TL: annual maps of the whole Alps 2015 to 2021 at 50 m from Sentinel-2, **read: the dataset page** (it states no dataset-specific licence: **NOT READ**, to be checked in the repository record before any use). Pointers, **NOT READ:** Dehecq et al. (2019) Alps Landsat 8 velocities 2013 to 2015; Millan et al. (2019, Remote Sensing) sensor comparison; a monthly Sentinel-2 record for 30 Mont Blanc glaciers 2016 to 2024 (The Cryosphere 2024; none of these six glaciers); Friedl et al. Sentinel-1 velocities for 12 regions.

**Ice speed already on the page:** ITS_LIVE (data/itslive/B57-05.json, rebuilt: identical): the flowline has 115 points of which 63 have values; the page's card value is 9 to 12 m/yr for 2013 to 2016, 5 to 8 m/yr for 2017 to 2022 and 6 m/yr in 2024, none in 2023 (under the card's floor); single cells elsewhere in the box reach 64 to 156 m/yr. Mölg et al. (2019) measured velocities in 2017 (PANGAEA dataset, not compared).

**Historical maps and outlines (round 2):** SGI1850, SGI1973 and SGI2023 areas are the ones of the panel (recomputed from the shapefiles in the panel audit); SGI1931 (Mannerfelt and Hodel, ETH Zürich 2022, CC BY 4.0 per its GLAMOS page, **read: the page and the shapefile**; based on terrestrial imagery and the first LK25 maps; each glacier carries its own date, see below) and SGI2010 are in the repository's GLAMOS inventory folder and were opened. Freudiger, Mennekes, Seibert, Weiler (2018), "Historical glacier outlines from digitized topographic maps of the Swiss Alps", Earth System Science Data 10, 805-814, doi:10.5194/essd-10-805-2018: outlines from 80 Siegfried sheets (maps published 1878 to 1918, and 1917 to 1944), data in FreiDok plus doi:10.6094/UNIFR/15008; **read: the article page** (the dataset licence is not on it: **NOT READ**), the outlines themselves were **not** opened. swisstopo's Dufour and Siegfried maps on map.geo.admin.ch: pointer, **NOT READ**.

**This glacier's outlines:** SGI1931: one polygon dated 1930-09-19, 17.85 km2 (computed); SGI2010 13.73 km2 (2 polygons); SGI2016 14.82 km2 (attribute, year_acq 2016: larger than SGI2010, probably debris-covered ice mapped).
