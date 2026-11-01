# Sources ledger: Switzerland / Rhonegletscher (SGI B43-03, site id `rhone`)

Search done: 2026-11-02, by Claude, following docs/DATA_SEARCH.md and docs/YEARLY_GLACIER_RUNBOOK.md. Box / period / purpose: the 3D strip of the record (data/regions/ch/rhone/glacier.json), 2016 to 2026, yearly ice surfaces and their checks. This is the pass made while building the surfaces; the full national-programme and literature search of docs/DATA_SEARCH.md was **not** repeated for Rhone beyond what is listed (see "Not read").

## Who holds what in this region
Same as docs/sources/switzerland-aletsch.md: GLAMOS (Glacier Monitoring Switzerland; separate DOIs per data type: volume change, length change, mass balance, point mass balance, ice thickness, inventories), swisstopo (swissALTI3D, swissSURFACE3D, image-strip footprints `ch.swisstopo.lubis-bildstreifen`, swissBEDROCK), NASA (ICESat-2 ATL06, ASTER AST14DEM).

## Sources (read / NOT READ stated; figures as the sources state them)
### GLAMOS volume change release 2025 (series and all-combinations tables) — role: context for the anchors
- Where: doi:10.18750/volumechange.2025.r2025; files `volumechange_2025_r2025_series.csv`, `..._allcombinations.csv` (local: experiments/aletsch-yearly-dem/glamos/zip/).
- Rows of B43-03 read: surfaces `sa3d-2018` (date_end 20109999), `sa3d-2019` (20169999), `is-stand` 20210812 and 20230823. Pair 2016 to 2023: dV -0.187328 km3, dh_mean -12.790 m, Bgeod -1.612 m w.e./a, sigma 0.183 (GLAMOS wording of the columns; the site shows the rounded values -0.19, -12.8, -1.61, 0.18).
- Licence: file header "scientific and non-commercial use". Read: the Rhone rows in full.
- Note: the 2021 surface is dated 20210812 by GLAMOS; the swissSURFACE3D point clouds of the strip carry the GPS day 2021-10-10 (21 tiles, 5 tiles flown on two days). The model uses the GPS day.

### swisstopo image strips (lubis-bildstreifen) — role: survey days of the swissALTI3D editions
- Where: api3.geo.admin.ch identify, layer `ch.swisstopo.lubis-bildstreifen`; result `B43-03/strips_geom.json`.
- 2016 strips over the 2016 ice: 2016-08-08 CRYOSPHERE MONITORING (49.6 % of ice cells, computed), 2016-09-07 SWISSIMAGE (100 %, computed). 2023: 2023-08-20 CRYOSPHERE MONITORING (59.6 %), 2023-09-05 SWISSIMAGE (100 %). Which strip fed which cell is not published. Licence: swisstopo open government data. Read: the footprints and attributes.

### swissALTI3D (2019 edition = A1, newest = 2024 edition = A2) and swissSURFACE3D — role: constraint
- 2 m points averaged on the 20 m grid; lidar raster 0.5 m read at 20 m, GPS times of the LAS points per tile (21 of 26 tiles one day: 2021-10-10). Licence: swisstopo open government data. Read: yes (the products), not the accuracy statements (swisstopo product pages returned HTTP 500 on 2026-11-01 for Gorner; not retried for Rhone).

### GLAMOS annual mass balance per elevation band (release 2025) — role: constraint (shape of the yearly lowering)
- `massbalance_fixdate_elevationbins.csv`: Rhone 100 m bins from 2200 m, 1885 to 2025. Licence: file headers say non-commercial. 2026: not in the release; estimated here (each band regressed on the glacier-wide Bw and Bs of Aletsch 2005 to 2025, evaluated at the Aletsch 2026 values read from the GLAMOS figure: Bw +751.6, Bs -3790.0 mm w.e., about +-100 mm w.e.; computed, labelled estimate). Read: yes.

### GLAMOS point mass balance (stakes, release 2025) — role: validation (never fitted)
- doi:10.18750/massbalance.point.2025.r2025; files `rhone_annual.dat`, `_winter.dat`, `_intermediate.dat`. 76 stake-years 2017 to 2025 (type 1) on modelled ice cells: modelled surface change 0.87 of the reading, RMSE 1.37 m (computed). Ratio by year 0.83, 0.87, 0.75, 0.73, 0.74, 0.89 (2017 to 2022), 0.99 (2024), 1.00 (2025); 2023 has no stake-year. Type 7 automatic cameras: 596 rows in the intermediate file (2019 to 2025), shown in the viewer. Read: ReadMe and the three files.

### GLAMOS ice thickness release 2020 (radar beds) — role: validation of the bed
- doi:10.18750/icethickness.2020.r2020; `B43-03_rhone_GlaThiDa.txt` (6158 rows), `_vaw-archiv.txt` (14542 rows); profile dates 2003 and 2008 in the strip. Licence CC BY 4.0 (landing page). Read: yes. Results in data/yearly/B43-03.json (`page.bed`): the ice-free ground below and next to the proglacial lake is not the bed (the DEM shows the water); flat cells and ground below the lake level (2209.1 m, computed) + 3 m are left out.

### ICESat-2 ATL06 v007 — role: validation and fit of the survey days
- 59 granules over the strip box; 896 shots on 2023 ice, July to October, in 5 granules (2020: 286, 2021: 217, 2024: 178, 2025: 215; none in 2022, 2023, none before 2020 in these months). A1 and A2 days chosen on the same shots: 2016-09-07 and 2023-08-23, rmse 1.26 m (2016-09-30 and 2023-08-23: 1.19 m, not a flown day). NASA, free; used for checking only.

### ASTER AST14DEM (NASA LP DAAC) — role: check only
- 23 scenes July to October 2016 to 2026 over the strip box; none passes the gate (rock NMAD at most 15 m, at least 300 rock and 200 ice cells; the closest has 15.4 m). Terms of use not read. The Aletsch RAGMAC set does not cover Rhone.

### Uncertainty (computed, 2026-11-02; replaces a first version)
- The first version gave 1.3 m for every year: it took the overall ICESat-2 rmse as the anchor value, which already holds the interpolation error, so the calibrated terms fell to zero. Now as for Aletsch: anchors 0.8 m (Aletsch value; swisstopo quotes 0.5 m below 2000 m and 1 to 3 m above as quoted by Bannwart et al., NOT read in the original; Rhone has no 2023 shot to check it), lidar 0.96 m (rmse of the 217 shots of 2021), factors k_i 0.205 and k_e 0.127 calibrated on the shots. Result (median / 90th percentile, m): 2016 0.8/1.0, 2017 1.0/1.7, 2018 1.0/1.9, 2019 1.0/1.9, 2020 1.6/1.6, 2021 1.0/1.0, 2022 0.9/1.2, 2023 0.8/0.8, 2024 1.0/1.1, 2025 1.3/1.7; 2026 viewer map median 2.0 / 2.7. If the swisstopo quotation is right for this high tongue (above 2000 m), the anchors alone are 1 to 3 m and every figure is larger.

### Literature found by search, NOT opened (snippets only)
- Tsutaki et al., J. Glaciology (proglacial lake formation at Rhonegletscher; "Lake B" appeared in 2005, thinning 3.4 m/a 2008 to 2009 near the terminus per the snippet); Sugiyama et al. 2007 Annals of Glaciology (flowline model); Nishimura et al. 2013 AAAR (ice flow and surface elevation 1874 to 2006); UNIL page (large circular crevasses near the terminus, late summer 2021); a Copernicus (The Cryosphere 2025) paper on a collapse feature. None used for a number on the site.

### Right panel of the site (audited 2026-11-02; every figure traced)
- **Areas** 20.00 (SGI1850), 17.44 (SGI1973), 13.58 km2 (SGI2023): equal to the SGI shapefiles (20.001, 17.436, 13.577; GLAMOS volume table: 20.0040 for 1850, 13.5779 for 2023). -6.42 km2, -32 %, 899 football pitches are computed from them.
- **Volume change 2016 to 2023** (GLAMOS, all-combinations file, pair sa3d-2019 / is-stand 20230823): dV -0.187328 km3, dh_mean -12.790 m, Bgeod -1.612 m w.e./a, sigma 0.183; shown rounded as -0.19, -12.8, -1.61, +-0.18. Since 1874 (18749999): dh -49.298 m, shown -49.3 (15 % of 330 m, computed). The site counts the strip against it: the modelled surface change 2016 to 2023 over the 11.4 km2 of modelled ice is -0.184 km3 (computed), 98 % of the GLAMOS volume change of the whole glacier on 78 % of its 2016 area: consistent.
- **Mismatch the page does not hide:** the glaciological balances in the chart (GLAMOS annual, 2017 to 2023: -1192, -1439, -718, -627, -94, -2416, -1864 mm w.e., mean -1193) are 26 % less negative than the geodetic -1612 mm w.e./a of the same period (computed). The site notes that the chart is not the same measurement as the survey.
- **Length:** 143 GLAMOS rows, none overlapping, sum -1844.90 m shown as -1 845 m (from 1879-09-01); 9.0 km in 1879 = 7.16 km (GLAMOS figure lc_stat_frequency, row Rhone, read in the PDF) + 1.845 km (computed; the 2024 to 2025 change is not in the series, so the 1879 length is 9.0 km or a little more). Wikipedia's infobox says 9.09 km (1879): not used.
- **Thickest ice:** model 419 m (swisstopo thickness map, mean 99 m, volume 1455.89 Mm3, year_mode 2016, read from the live service) and radar 451 m (GLAMOS ice thickness files: profile 20030426, 451.00 m; position equals the site's pin).
- **Water:** 1.5 km3 of 58.6 km3 (1.456 / 58.646 = 2.5 %); estimate for autumn 2026 recomputed here: 1.164 km3 of ice, 1.047 trillion litres (0.9), shown 1.0 trillion L and 419.0 thousand pools, 0.3 Lake Zurich, 1.1 years of tap water.
- **Swiss tab:** 1.6 % of the glaciated area (13.58 / 860 km2), rank 7 of 1,289: equal to the site's own ranking.
- **Ice speed (ITS_LIVE annual mosaics v2.1, 120 m):** the card shows fastest ice 19 m/yr (2024), fastest year 27 m/yr (2016), slowest 6 m/yr (2020). Recomputed here: 5.8 m/yr in 2020 is at the floor of 5 m/yr under which the product does not tell ice from rock, and the yearly values jump between 5.8 and 27 m/yr: noise of image-pair velocities on a slow glacier, not a result. Only 66 of 93 flowline points ever have a value. Left unchanged, flagged for the owner.
- **Texts:** news note (Euronews, 7 August 2026): read, matches. Ice grotto fact (swissinfo, 5 September 2026): rewritten to what the article states (earlier text: Hotel Belvedere, "since about 1870", white fleece: not found in sources I could open). Lede: "below the Dammastock", "between the Furka and Grimsel passes" (Wikipedia, Rhone Glacier: "between the Grimsel Pass and the Furka Pass", "The Dammastock ... is the highest summit above the glacier"); the flow direction south is from the strip (azimuth 4.3 degrees up-glacier). Look text (lake above Gletsch): not sourced on the page; the lake is visible in the pictures. Name: Wikipedia (Rhone): "continues the Latin Rhodanus", "The Gaulish name of the river was *Rodonos or *Rotonos"; the earlier "etymology unclear, Celtic and Greek origins proposed" is not in that article and was replaced; the Historical Dictionary of Switzerland was not read and is no longer cited.
- **Hike** (Furka-Hohenweg, route 51): the earlier "11 km, about 5.5 h, demanding" could not be confirmed (SchweizMobil's page does not load without a browser; search.ch lists stage 1 Oberwald to Furkapass as 11 km, 4 h 30 min; Swiss Activities lists the whole route as "Schwer"); the figures were taken out. **Bike** (Rhone-Route, route 1): "starts in Andermatt, first stage climbs the Furka Pass": equal to MySwitzerland (stage 1 Andermatt to Oberwald, via the Furkapass).

## Data types checklist
- [x] outlines (SGI1850, 1973, 2016, 2023) - [x] length change (143 rows, none overlapping) - [x] glacier-wide balance (GLAMOS, used through the bins) - [x] elevation-band balance - [x] point/stake/camera - [x] volume / geodetic - [x] thickness (radar) - [x] elevation models with survey dates - [x] altimetry (ICESat-2; GEDI not used) - [x] ice speed (ITS_LIVE card) - [ ] snow/firn/ELA - [ ] imagery geometry - [ ] papers about this glacier (full text read) - [ ] field data - [ ] names and facts (partly)

## Not read / left out of the site (for the owner)
- The papers above (snippets only); ASTER terms of use; the swisstopo accuracy pages; the hike, bike and name texts of the panel; GLAMOS reports on the Rhone stations (the camera method is described in Landmann et al. 2021, see docs/sources/switzerland-aletsch.md).
- Open for the owner: the margin fade of 80 m is NOT applied to Rhone (the owner said Gorner only for now). Without it the step between the ice just inside and the ground just outside the 2023 outline grows from a median -5.8 m (2023) to -7.5 m (2024) and -12.9 m (2026) (computed); with it the growth would be removed as for Gorner (`EDGE_M=80` in experiments/rhone-yearly-dem/model.py). GLAMOS figure rounding on the site.
