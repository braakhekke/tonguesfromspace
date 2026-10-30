# Yearly ice-surface models for a glacier tongue: method and lessons

Written 2026-10-30 from the Aletsch work (`experiments/aletsch-yearly-dem/`, local, gitignored; ledger `LEDGER.md` there). **A recipe, not a product:** every source below must be found again for the glacier at hand (docs/DATA_SEARCH.md), read, and logged as read / NOT READ. Nothing goes into `data/`, `js/` or the dock without the owner's go-ahead.

**Update 2026-10-30 (evening):** the Aletsch yearly surfaces are now on the site (owner go-ahead): see docs/REFERENCE.md, row "data/yearly/B36-26.npz", for the pipeline (`strip_inputs.py` -> `strip_model.py` -> `export_site_yearly.py` -> `scripts/build_terrain_bundle.py`). Run them in that order after the strip changes in the walkthrough (and `npm run walkthrough -- export` first: the bundle builder reads `data/boxes.js`).

## 0. Rules that came out of the work
- **Satellite imagery is never altered, covered or super-resolved** (owner, strong). Masks are drawn on copies for checking only; in the viewer's image mode nothing is drawn over the picture. One imagery source per timelapse (the site's pinned Sentinel-2 scene).
- External numbers as the source states them; figure-read values labelled as read from a plot; computed values labelled computed.
- Each source has one role: **constraint** (anchors the model) or **validation** (never fitted). Check what a "validation" really is: GPR files carried the 2009 DEM surface, not a 2011 measurement; the ICESat-2 shots used to tune the extrapolation are not an independent test of it.
- Licences: the stricter wins (GLAMOS: non-commercial in file headers; airborne DEMs "internal use only": local only). Unread licence = not published.
- Glaciological years are named after the year they end in; year-end surface = 30 Sep (northern hemisphere).

## 1. Find the measured surfaces and their real dates
1. National DEM editions: edition year is not survey year. Open the product's STAC items and **the flight-strip footprints** (Swiss: `ch.swisstopo.lubis-bildstreifen` via api3.geo.admin.ch identify: `flugdatum`, goal, gsd). The newest "2024 edition" of swissALTI3D was built from 2023 flights.
2. Lidar (swissSURFACE3D): read the point GPS times per tile for flight days (the tongue had five dates over two months).
3. Composite DEMs: map the strips to cells; where the source does not say which strip fed which cell, **use an independent referee**: ICESat-2 scored the candidate survey days (2023-08-10 vs 2023-09-06 vs 2024-08-30; the wrong day gave rmse 7.7 m against 3.2 m).
4. Keep the anchors apart from airborne DEMs that are internal-use-only.

## 2. Model (v1 in the Aletsch work)
`S(x,t) = A_a + (A_b - A_a) * Phi(z,t)` between two dated surfaces; `Phi` from the national annual balance per 100 m elevation band, lowering the ice from snow-off (1 May + 153 d x Bw/|Bs|) to 30 Sep (uniform; the stake curve is front-loaded, a known weak point). Extrapolate beyond the last anchor with the last segment's cell scale. Add the bed floor (section 4). Three anchors beat the site's two-epoch recipe in leave-one-granule-out cross-validation.
Estimate uncertainty per year and cell (anchor error, interpolation, extrapolation); say it was calibrated on the same shots.

## 3. Validate (each source once, in one role)
- **ICESat-2 ATL06** (range reads of the cloud HDF5; datum fit on rock, NMAD about 1 m). Use a physical-envelope outlier rule (one shot lay 1177 m below the surface). Leave-one-granule-out. Years without summer shots stay unchecked: say so.
- **ASTER** (3-D co-registration with xdem, slope weights; reads about 3 m high on ice).
- **Stakes/cameras** (GLAMOS point file is a separate DOI): stakes read ablation of moving ice, so the model change is 0.5 to 0.75 of it and the ratio rises as the glacier thins; they cannot discriminate single years.
- **Radar (TanDEM-X, SRTM, Copernicus DEM): never an absolute surface on ice** (Hugonnet 2021, Bannwart 2024). Same-season autumn differences only, rock offset removed. Aletsch 2018-11-01 to 2019-10-30: radar change -3.72 m vs model -4.59 m (median), rms 2.1 m.
- **GEDI**: counted first; on Aletsch no usable shots (8 pass the flags and stand 3 to 29 m above the surface).
- Shadow method (Pfau 2023): simulate how much of the tongue is ever shaded before doing pixel work (under 1 % here).

## 4. Bed
National thickness model (Swiss: swissBEDROCK 10 m = GLAMOS 2020 model; GLAMOS ice-thickness release 2020 holds the GPR points with per-point min/max). Check it against the measured surfaces: the bed sat above a measured surface in 2.6 % of ice cells, so `bed = min(bed, lowest measured surface)`, then cap the extrapolated surfaces at the bed. Show distance to the nearest GPR line as the bed's certainty. The bed's own uncertainty band can be empty.

## 5. Lakes and other water
Lake extent from the **coast**, not the water colour: fit the false-colour values of a band just outside the lake (excluding cyan), mark pixels significantly different and darker in NIR, connect to the core, leave out the 1 to 2 px outflow stream; cross-check with a marker watershed on the band gradient. Level has no measurement unless a lidar point, GNSS or dated photo exists (ICESat-2 had none within 60 m): state it as an assumption.

## 6. Viewer (three.js, one HTML file)
Year slider, Sentinel-2 drape, colour modes (surface, change, uncertainty, difference to the site's model, ice thickness, bed elevation, distance to GPR), vertical exaggeration, "Ice shown" slider (0 % shows the bed), ICESat-2 dots at modelled surface plus observed offset (terrain-aware visibility), stakes, comparison split view with the site's own recipe (rebuilt from `data/demchange` and the glacier-wide balance series), hover with every number. Test headless with Playwright (`--use-gl=swiftshader`); keep scripts order-safe (a block placed before `scene` broke the page once).

## 7. Traps (each cost time)
- A national programme's datasets have separate DOIs per data type; list every link on the downloads page.
- Datums: LN02 vs ellipsoid (about 53 m) vs EGM96; verify on stable terrain.
- Tongue masks and centrelines: check which column is which (a swapped x,y gave a wrong mask).
- The site's own data can be broken (truncated `data/itslive/B36-26.json`; `build_itslive.py` crashes on numpy int64): report, do not fix silently.
- Do not write "2023" for what is a 2024 edition; read the files, not the labels.
- Keep command output out of chat; use logs.
