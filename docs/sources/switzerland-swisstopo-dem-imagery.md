# Sources ledger: Switzerland / swissALTI3D editions and SWISSIMAGE flight years (all ten glaciers)

Search done: 2026-10-30, by Claude. Question: which real dates stand behind the swissALTI3D surfaces of `data/demchange/` and behind the SWISSIMAGE editions, so a "measured surface + aerial photograph" 3D view can label them correctly. Role of every source: context for labels (nothing is fitted). Exact wording is German, quoted as printed.

## swissALTI3D Ausgabebericht 2024 Release 2 (Valais) — read
- File: https://backend.swisstopo.admin.ch/fileservice/sdweb-docs-prod-swisstopoch-files/files/2025/01/17/d39dd07e-4a20-408e-9113-509963f215c6.pdf (5 pages, text extracted and read, page 3).
- Wording: "Für die zweite Ausgabe 2024 von swissALTI3D wurde der Kanton Wallis nachgeführt. Die Grundlagedaten dieser Region werden durch LiDAR-Daten aus den Jahren 2021/2022 gebildet. Nach Identifikation der zeitlich bedingten Veränderungen wurde das Gebiet fotogrammetrisch anhand von Luftbildern aus dem Jahr 2023 aktualisiert. Die Fläche der Region beläuft sich auf 5978 km2"
- Announcement page https://www.swisstopo.admin.ch/en/height-model-swissalti3d-update-20241220 : "Published on 20 December 2024"; "The entire canton of Valais has been updated with new elevation data."

## swissALTI3D Ausgabebericht 2025 Release 2 (southern Bern) — read
- File: https://www.swisstopo.admin.ch/dam/de/sd-web/4USGcfTn4oKQ/swissALTI3D-release-2025_2_de_bf.pdf (PDF creation date 2025-11-10; text extracted and read, page 3). Its page 1 says "ersten Publikation 2025", a slip in swisstopo's text; the title says Release 2.
- Wording: "Für die zweite Ausgabe 2025 von swissALTI3D der südliche Teil des Kantons Bern nachgeführt. Die Grundlagedaten dieser Region werden durch LiDAR-Daten aus dem Jahr 2023 gebildet. Nach Identifikation der zeitlich bedingten Veränderungen wurde das Gebiet fotogrammetrisch anhand von Luftbildern aus dem Jahr 2024 aktualisiert. Die Fläche der Region beläuft sich auf 3763 km2."
- Figures 2 and 3 (map of the updated area) are images: NOT READ.

## What the product page says — read
- https://www.swisstopo.admin.ch/en/height-model-swissalti3d : "updated every six years"; accuracy 1 sigma: new-generation LiDAR 0.3 m; previous-generation LiDAR below 2,000 m 0.5 m; stereo correlation above 2,000 m "1 to 3 m". Grids 0.5 m or 2 m. The page itself states no licence and links to the terms of use (NOT opened).
- Report text (both Berichte): above 2000 m, until replaced by LiDAR, heights come from stereo correlation of swisstopo aerial photographs "(Flugjahre 2008 bis 2011)".

## Edition of each tile, from the STAC API (https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d) — read for one place
- Tiles at the Aletsch tongue (LV95 2644-2646 / 1141-1143) exist as `swissalti3d_2019_…` and `swissalti3d_2024_…` (item datetime 2024-01-01, created 2024-12-19); no 2025 tile there. This agrees with `data/demchange/B36-26.json` (new edition 2024, 34135 cells).
- The tile year is the edition (publication) year, not a survey year.

## What `data/demchange/*.json` says about the newest surface (checked against the above)
- Edition 2024 (Valais): B36-26 Aletsch, B53-04, B56-03, B56-07 Gorner, B57-05 Zmutt, B83-03 Corbassière; B40-07 Fiescher and B43-03 Rhone have 5651 and 6085 cells of edition 2025. Edition 2025 (southern Bern): A54e-24 Trift, A54g-11 Unteraar.
- Correct label for the newest surface: "swissALTI3D edition 2024, base LiDAR 2021/2022, updated from aerial images of 2023" (Valais) or "edition 2025, base LiDAR 2023, updated from aerial images of 2024" (southern Bern). It is NOT "surveyed 2024" and not one survey year.
- The same ground is not one date: where the surface "had not changed by more than the threshold" the base LiDAR remains (the Berichte: the DTM is updated "in Bereichen, wo eine Abweichung in der Höhe von mehr als ± 50 cm (± 30 cm bei LiDAR-Daten der neuen Generation) festgestellt wird"). Glacier ice changes by more, so on the ice the aerial images apply (the script's claim; the Berichte do not name glaciers).
- The 2019 edition's "survey" years (2015 to 2017) come from the GLAMOS volume change table (doi:10.18750/volumechange.2025.r2025) per `build_dem_change.py`; that table was NOT re-opened today. Where GLAMOS lists only sa3d-2018 the file says `assumed: true`.

## SWISSIMAGE — flight year per edition, identify service on layer ch.swisstopo.swissimage-product.metadata, read for one point near the Aletsch tongue (8.04, 46.45; map sheet 2646_1144)
| edition (time parameter) | `flightyear` | `gsd` |
|---|---|---|
| 2019 | 2017 | 25 cm |
| 2021 | 2020 | 10 cm |
| 2023 | 2023 | 25 cm |
| 2024 | 2023 | 25 cm |
| 2025 | 2023 | 25 cm |
- STAC collection ch.swisstopo.swissimage-dop10 holds the same sheet as `…_2017_`, `…_2020_`, `…_2023_` (the flight years).
- So the aerial photograph of the "newest" edition is flown 2023 at this place, resolution 25 cm (not 10 cm); only some sheets have 10 cm.
- Product sheet (found by search, NOT opened): 10 cm in plains and main valleys, 25 cm in the Alps.
- Flight year and edition differ; the page must show the flight year read from this layer (`flownYear` in `js/05-map.js` already does).

## Pairing that follows
For Aletsch the newest surface (edition 2024; aerial images 2023 for the update) and the 2023 SWISSIMAGE flight agree in year; the 2019 surface (GLAMOS: survey 2017) and the SWISSIMAGE flight 2017 also agree. Other glaciers must be checked per sheet before the view claims a pair.

## Not read
swissALTI3D Figure 2/3 maps; GLAMOS table today; swisstopo terms of use; SWISSIMAGE product sheet; per-glacier flight years for the nine other glaciers.
