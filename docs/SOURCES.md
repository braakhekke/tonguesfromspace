# Data sources and licences

Moved here from the README, unchanged. The README keeps the summary of the three licences.


- **Imagery:** Copernicus Sentinel-2 L1C and L2A via the Copernicus Data Space Ecosystem. Contains modified Copernicus Sentinel data. Free for any use with attribution.
- **Glacier areas and outlines:** GLAMOS Swiss Glacier Inventories 1850, 1973 and 2023, CC BY 4.0.
- **Length change:** GLAMOS (2025), Swiss Glacier Length Change, release 2025, doi:10.18750/lengthchange.2025.r2025. Free for scientific and **non-commercial** use with the source indicated. The length today is read from the GLAMOS figure [lc_stat_frequency](https://doi.glamos.ch/figures/lc_stat_frequency.pdf).
- **Volume change:** GLAMOS (2025), Swiss Glacier Volume Change, release 2025, doi:10.18750/volumechange.2025.r2025. Geodetic volume change of each glacier from elevation models; the file says: free for scientific and **non-commercial** use with the source indicated (the landing page says CC BY 4.0).
- **Yearly mass balance:** GLAMOS (2025), Swiss Glacier Mass Balance, release 2025, doi:10.18750/massbalance.2025.r2025. Direct glacier-wide balance of about 40 glaciers (four of the ten: Aletsch, Rhone, Corbassière, Findel); the file says non-commercial use.
- **Swiss-wide volume:** GLAMOS (2025), Swisswide Glacier Mass Balance, release 2025, doi:10.18750/massbalance.swisswide.2025.r2025. Yearly volume of all Swiss glaciers; the same non-commercial wording in the file.
- **Radar ice thickness:** GLAMOS (2020), Swiss Glacier Ice Thickness, release 2020, doi:10.18750/icethickness.2020.r2020 (CC BY 4.0). Ground-penetrating radar points, thinned to one mean per 50 m cell.
- **Street View panoramas (Aletsch):** © Google, photographed by Google or by visitors (the contributor is named in the panel). They are shown in Google's own viewer (Maps Embed API, free); only the panorama ids are stored (`data/streetview.json`), which Google allows. Without the key `STREETVIEW_EMBED_KEY` (see below) the layer is not offered.
- **Yearly volume loss:** GLAMOS and the Swiss Academy of Sciences (SCNAT) annual glacier reports.
- **Ice thickness and volume per glacier:** Grab et al. (2021), Journal of Glaciology 67(266), via the swisstopo map service.
- **Water use:** SVGW water statistics.
- **Background:** Sentinel-2 cloudless 2024 by EOX IT Services GmbH ([s2maps.eu](https://s2maps.eu)), CC BY-NC-SA 4.0. **Base map and place labels:** © OpenStreetMap contributors.
- **Font:** Schibsted Grotesk, SIL Open Font Licence 1.1 (`fonts/OFL.txt`).
