# Sources ledger: Switzerland / Gornergletscher (SGI B56-07, site id `gorner`)

This ledger was NOT written when the Gorner surfaces were built (2026-11-01); the sources are named in `data/yearly/B56-07.json` (anchors, validation, licences) and in docs/YEARLY_GLACIER_RUNBOOK.md. It holds only what was added later; the full source-search ledger of docs/DATA_SEARCH.md is still to be written.

### Uncertainty of the yearly surfaces (computed 2026-11-02, `experiments/yearly_uncertainty.py`)
- Anchors (swisstopo surveys) 1.74 m (rmse of the 513 shots of 2023), lidar 1.65 m (rmse of 166 shots within 45 days of the lidar day), factors k_i 0.169 and k_e 0.207, calibrated on the ICESat-2 shots (so not independent). Median / 90th percentile by year (m): 2016 1.8/2.6, 2017 1.8/3.0, 2018 1.8/3.0, 2019 1.8/2.8, 2020 1.9/2.3, 2021 1.6/1.8, 2022 1.9/1.9, 2023 1.7/1.7, 2024 2.1/2.4, 2025 2.4/3.6; 2026 viewer map median 3.2 / 5.4. swisstopo quotes 0.5 m below 2000 m and 1 to 3 m above (as quoted by Bannwart et al., NOT read in the original): the tongue lies mostly above 2000 m, so the anchors may be larger than the data say. The first version of this entry (flat) was replaced; see docs/YEARLY_GLACIER_RUNBOOK.md, "Uncertainty".

### Right panel audit (2026-11-01)
See the report of that day: areas, GLAMOS volume change (-0.499331 km3, -12.102 m, -1.385 m w.e./a, 2015 to 2023), length (7 overlapping rows, sum -3094.10 m, about 115 m too much), thickest ice (swisstopo 385 m, radar 454 m 2004), speed card (2013 and 2014 maps have gaps: years left empty by `speedYearOk`), texts (name text rewritten after gornergrat.ch; Wikipedia Gorner Glacier: 53 km2, 2007).

### Yearly surfaces, harmonised run of 2026-11-02 (`experiments/swiss-yearly-dem/`, `GLACIER=B56-07`)
- Survey days (flown strip days only, chosen on ICESat-2; `fit.json`): A1 2015-08-26, A2 2023-08-21; lowest pair rmse 1.942 m, leave-one-granule-out 1.947 m; tie within 0.05 m: 2015-08-05 / 2023-08-21; 2015-08-26 / 2023-08-21; 2015-09-20 / 2023-08-21. Not independent of the check.
- ICESat-2 (leave-one-granule-out): 2002 shots in 10 granules, rmse 1.95 m, bias 0.85 m; with the used days 1.95 m. Per year: 2020 1.77 m (292); 2021 1.35 m (307); 2022 1.92 m (319); 2023 1.81 m (513); 2024 2.14 m (128); 2025 2.45 m (443).
- Uncertainty (`experiments/yearly_uncertainty.py`): sigma_A 1.81 m (rmse of the 513 shots of 2023), sigma_L 1.63 m (rmse of 186 shots within 45 days of the lidar day), k_i 0.140, k_e 0.202; median by year: 2016 1.8, 2017 1.7, 2018 1.7, 2019 1.7, 2020 1.8, 2021 1.5, 2022 1.9, 2023 1.8, 2024 2.1, 2025 2.4; 2026 viewer map median 3.2 m.
- Band balance (`donors.json`, rule: lowest ICESat-2 rmse among the candidates whose bins cover at least 98 % of the ice cells; own bands always win): line 1.95 m, covers 100 %; B36-26 2.26 m, covers 100 %; B83-03 2.03 m, covers 100 %; B56-03 2.04 m, covers 55 %; B43-03 2.75 m, covers 100 %; chosen: line.
- ASTER AST14DEM: 20 of 99 scenes passed the gate (rock NMAD at most 15 m, 300 rock and 200 ice cells); years 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024; terms of use NOT read.
- Margin fade: 80 m (owner, 2026-11-01, Gorner only). Earlier numbers in this ledger (uncertainty, ICESat-2 per year, survey days) are superseded by this section.
