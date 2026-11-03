# Data sources and licences

Moved here from the README, unchanged. The README keeps the summary of the three licences.


- **Imagery:** Copernicus Sentinel-2 L1C and L2A via the Copernicus Data Space Ecosystem. Contains modified Copernicus Sentinel data. Free for any use with attribution.
- **Glacier areas and outlines:** GLAMOS Swiss Glacier Inventories 1850, 1973 and 2023, CC BY 4.0.
- **Length change:** GLAMOS (2025), Swiss Glacier Length Change, release 2025, doi:10.18750/lengthchange.2025.r2025. Free for scientific and **non-commercial** use with the source indicated. The length today is read from the GLAMOS figure [lc_stat_frequency](https://doi.glamos.ch/figures/lc_stat_frequency.pdf).
- **Volume change:** GLAMOS (2025), Swiss Glacier Volume Change, release 2025, doi:10.18750/volumechange.2025.r2025. Geodetic volume change of each glacier from elevation models; the file says: free for scientific and **non-commercial** use with the source indicated (the landing page says CC BY 4.0).
- **Yearly mass balance:** GLAMOS (2025), Swiss Glacier Mass Balance, release 2025, doi:10.18750/massbalance.2025.r2025. Direct glacier-wide balance of about 40 glaciers (four of the ten: Aletsch, Rhone, Corbassière, Findel); the file says non-commercial use.
- **Swiss-wide volume:** GLAMOS (2025), Swisswide Glacier Mass Balance, release 2025, doi:10.18750/massbalance.swisswide.2025.r2025. Yearly volume of all Swiss glaciers; the same non-commercial wording in the file.
- **Radar ice thickness:** GLAMOS (2020), Swiss Glacier Ice Thickness, release 2020, doi:10.18750/icethickness.2020.r2020 (CC BY 4.0). Ground-penetrating radar points, thinned to one mean per 50 m cell.
- **Bed under the ice (3D thickness cross-section):** swissBEDROCK, Federal Office of Topography swisstopo, release 1 (August 2025), band BEM, 10 m, https://www.swisstopo.admin.ch/en/3d-swissbedrock-en. Free geodata: use, processing and commercial use allowed, credit mandatory (https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices, version 1.3.2021). Under glaciers it is swissALTI3D 10 m minus a modelled ice thickness (GLAMOS 2020), "a maximum estimate of the bedrock surface" (release notes). Licence ledger: `docs/sources/ch-swissbedrock.md`. Baked into `data/terrain/<id>.bin` by `scripts/build_terrain_bundle.py` (Aletsch so far).
- **Street View panoramas (Aletsch):** © Google, photographed by Google or by visitors (the contributor is named in the panel). They are shown in Google's own viewer (Maps Embed API, free); only the panorama ids are stored (`data/streetview.json`), which Google allows. Without the key `STREETVIEW_EMBED_KEY` (see below) the layer is not offered.
- **Yearly volume loss:** GLAMOS and the Swiss Academy of Sciences (SCNAT) annual glacier reports.
- **Ice thickness and volume per glacier:** Grab et al. (2021), Journal of Glaciology 67(266), via the swisstopo map service.
- **Water use:** SVGW water statistics.
- **Background:** Sentinel-2 cloudless 2024 by EOX IT Services GmbH ([s2maps.eu](https://s2maps.eu)), CC BY-NC-SA 4.0. **Base map and place labels:** © OpenStreetMap contributors.
- **Font:** Schibsted Grotesk, SIL Open Font Licence 1.1 (`fonts/OFL.txt`).
- **Yearly ice surfaces of Grosser Aletsch (3D view, 2016 to 2026; `data/yearly/B36-26.json`, `provenance.html`):** swissALTI3D (2019 and 2024 editions) and swissSURFACE3D raster, © Federal Office of Topography swisstopo, open government data: terms page read 2026-10-30 ("may be used, distributed and made accessible; enriched and processed and also used commercially. A reference to the source is mandatory"); GLAMOS mass balance per elevation band (release 2025, non-commercial, `doi:10.18750/massbalance.2025.r2025`); ICESat-2 ATL06 for checking only; swissBEDROCK (swisstopo) as the floor (`docs/sources/ch-swissbedrock.md`). The airborne DEMs of 2009, 2011 and 2017 of the RAGMAC set are NOT used (readmes: internal use only). **Super-resolved picture (optional 3D layer):** SEN2SR (tacofoundation, model card licence cc0-1.0, read 2026-10-30) applied to the pinned Sentinel-2 scenes (Copernicus data); the extra detail is the model's estimate.

## Glacier totals on the front page (home.html, under the map)

Read 2026-11-03; each is the count the source states, and what counts as a glacier differs between inventories.

- Switzerland: "1,400 individual glacier entities" (SGI2016), Linsbauer et al. 2021, Frontiers in Earth Science, doi 10.3389/feart.2021.704189.
- Iceland 568 and Svalbard 1615 (Svalbard and Jan Mayen): Randolph Glacier Inventory 6.0, regional table at https://rgidata.org/user_guide/regions/overview.html.
- Norway: "3143 glaciers" of the 1999-2006 inventory, Andreassen et al. 2022, Journal of Glaciology (doi 10.1017/jog.2022.20). The count of its newer 2018-19 inventory is in Table 3 (an image), NOT READ, so it is not used.
