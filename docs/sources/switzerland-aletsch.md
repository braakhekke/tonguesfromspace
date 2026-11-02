# Sources ledger: Switzerland / Grosser Aletsch (RGI60-11.01450, SGI B36-26, WGMS glacier id 360)

Search done: 2026-10-30, by Claude, following docs/DATA_SEARCH.md. **Scope of this file: three source families asked for by the owner: ESA Glaciers_cci, CryoSat-2, ERA5 / ERA5-Land.** The other Aletsch sources (GLAMOS, swisstopo, Hugonnet, Piermattei, Bannwart, RAGMAC, ITS_LIVE, WGMS FoG ...) are in the local ledger `experiments/aletsch-yearly-dem/LEDGER.md` and are not repeated here. Box / period / purpose: the tongue box of the site, 2016 to now; purpose: find what could constrain or validate outlines, elevation change, mass balance and climate for the tongue.

Ids: RGI60-11.01450 and WGMS id 360 are copied from the local ledger (line "Grosser Aletsch = glacier id 360, RGI60-11.01450", WGMS FoG 2026-02-10), SGI B36-26 from CLAUDE.md/ledger; not re-checked today.

## Who holds what in this region (Switzerland; region note, partly from the earlier Aletsch work)
- National monitoring programme: GLAMOS (separate DOIs per data type; see local ledger). Not repeated here.
- Mapping agency: swisstopo (see local ledger).
- ESA programmes touching the Alps: Glaciers_cci (University of Zurich, F. Paul, with ENVEO) produced the Sentinel-2 Alps inventory (Paul et al. 2020); its own CRDP database has **no Alps product** (below). CryoSat-2 land-ice products come from the CryoTEMPO-EOLIS project (University of Edinburgh, Earthwave, ESA); Central Europe is in the **point** product only.
- Reanalysis: ECMWF/Copernicus Climate Change Service (C3S) ERA5 and ERA5-Land through the Climate Data Store (CDS).
- Local-language terms used: none needed for these three families (all English-language programmes); German terms were used in the local ledger.

## Sources

### Glaciers_cci project page and CRDP database (ENVEO) — what exists for the Alps — role: context
- Where: https://climate.esa.int/en/projects/glaciers/ ; database http://glaciers-cci.enveo.at/crdp2/index.html ; Climate Research Data Package technical note `Glaciers_cci+_Ph2_D3.2_CRDP`, version 0.2, 28.06.2024 (https://climate.esa.int/media/documents/glaciers_cci-plus_ph2_d32_CRDP.pdf, 1.78 MB).
- Dates: database entries carry their own periods, e.g. Greenland 1994-2009, Karakoram 1998-2002, Svalbard 1990 - 2007 (elevation change, SPOT & Nat. DEMs), New Zealand 2000 - 2006; velocity entries for Pamirs, Karakoram, Eastern Himalaya, New Zealand, Svalbard, Canadian Arctic, South Georgia (2000 to 2016).
- **Finding: the database lists no entry for RGI region 11 (Alps / Central Europe) in any of its tabs (Glacier Area, EC-Altimetry, EC-DEMDIF, Ice Velocity).** The CRDP note contains no hit for "Alps", "Aletsch", "Switzerland" or "Central Europe". Its products: global surge inventory 2017-2022 (Kääb et al. 2023, doi 10.1017/jog.2023.35, 116 events), elevation change of Greenland peripheral glaciers, and further sections not read in full (velocity, area).
- Licence: ESA page states none; ENVEO site has a data policy page (`/datapolicy.html`, link seen, NOT opened).
- Read: ESA page read (links listed); ENVEO page read in full (text); CRDP note: text extracted and searched for Alps terms, sections 2 to 4 read, the rest searched only. ESA Open Data Portal (https://climate.esa.int/en/odp/#/dashboard, JavaScript dashboard) NOT READ. CEDA/NERC catalogue record b05d478170e14356bbe2c3cce3f7bf67 returned HTTP 400, NOT READ.
- Notes: the ESA page itself says Glaciers data "is currently inaccessible through our toolbox's data access channels" (page-reader summary; wording not checked on the page).

### Paul et al. 2020 / PANGAEA 909133 — glacier outlines of the Alps from Sentinel-2, 2015 — role: validation (outline) / context
- Where: Earth Syst. Sci. Data 12, 1805-1821, https://doi.org/10.5194/essd-12-1805-2020 ; data https://doi.org/10.1594/PANGAEA.909133 (published 2019-11-26, DOI registered 2020-07-22), file `c3s_gi_rgi11_s2_2015_v2.zip` (7.5 MB), downloaded and opened.
- **Aletsch record in the file** (shapefile, UTM zone 32N, attributes copied): GLACIER_NR 3073, LAT 46.4828, LON 7.97145, AREA_KM2 77.2547, ELEV_MIN 1695.04, ELEV_MAX 4128.04, ELEV_MEAN 3072.73, ELEV_MED 3178, Tile_Name 32TMS, S2_footpri S2_32TMS_20150829, **Date 2015-08-29**, Funding "ESA_GLACIERS_CCI, ECMWF-C3S", Analyst "Y. Schaub, R. Le Bris, F. Paul, P. Rastner; UZH", O2_REGION "Alps (11-01)", Country CH. File has 4395 records, 21 fields. Other glacier units in the same file near the Aletsch basin (GLACIER_NR 3042, 3069, 3082) were not identified by name; whether 3073 includes the tributary basins as one unit is NOT checked.
- Dates (article, page reader): Switzerland "five tiles from 29 August 2015, plus one southeast tile (32TNS) from 26 August 2015"; DEM for topography: ALOS AW3D30. Guide: earlier national inventory 2008-2011 (Fischer et al. 2014). Total area "1806 ±60 km² ... 4394 glaciers > 0.01 km²".
- Licence: PANGAEA landing page "Creative Commons Attribution 4.0 International (CC-BY-4.0)"; article CC BY 4.0. Allows commercial use.
- Independent of: SGI2016 only partly (SGI/Fischer 2014 was used as a guide for the outlines; SGI2016 is not mentioned in the article).
- Read: PANGAEA record and the shapefile read; article page read via page reader (not the full PDF text).
- Notes: this is a 2015 outline of Aletsch, a second epoch independent of RGI 6.0 (about 2000). The article does not call it a Glaciers_cci product, but the file's Funding field names ESA_GLACIERS_CCI. Not yet compared with the SGI2016 outline area.

### CryoTEMPO-EOLIS (CryoSat-2 swath elevations) — role: validation candidate (never fitted); licence unresolved
- Where: https://cryotempo-eolis.org ; ESA Earth Online collection https://earth.esa.int/eogateway/catalog/cryotempo-eolis , **DOI 10.5270/CR2-2xs4q4l** (resolved; the catalogue page prints "CryoTEMPO-EOLIS, Version 3.0"); Product Handbook issue 4.1 (7/4/26), ATBD (53 pages); download via FTP ftp://science-pds.cryosat.esa.int/ (TEMPO_SWATH_POINT, TEMPO_SWATH_GRID) or https://cs2eo.org/cryotempo.
- **Central Europe is in the point product** (zone code CENTRALEU, EPSG:3035 "Scandinavia / Central Europe", 100 x 100 km tiles, monthly NetCDF, variables elevation, elevation_uncertainty, elevation_difference_to_reference_dem, is_swath, input_file_id). **It is NOT in the gridded product** (handbook list of gridded regions: Greenland Ice Sheet, Antarctic Ice Sheet, Alaska, Arctic Canada North/South, Greenland periphery, Iceland, Svalbard, Russian Arctic, Southern Andes, Antarctic periphery). So there is no gridded elevation-change map for Aletsch from this product.
- Dates (exact wording, handbook 2.3.3): "Baseline 3 – Currently in operation: All regions have monthly data available from December 2025. The data from July 2010 for all regions will be published after back processing has been completed. Baseline 2 – No longer in operation: All regions have monthly data available from July 2010 – December 2025." **Conflict:** the website point-product page says Baseline 3 "from January 2026". ESA catalogue: "Temporal coverage : 2010-07-16 - present". Whether the Baseline 2 files (2010-2025) for CENTRALEU are still downloadable: NOT checked.
- Reference DEM: Baseline 3 uses Copernicus DEM for the non-polar regions (handbook 4.4.1: "we have updated the reference DEMs for the non-polar regions to all utilise Copernicus"). Radar penetration into snow/firn is listed by the ATBD among the error terms of the difference to the reference DEM; no Alps-specific penetration figure found.
- Datum / resolution: not read for this region.
- Licence: **none stated** on the product pages. ESA catalogue: "The access and use of Cryosat products are regulated by the ESA's Data Policy and subject to the acceptance of the specific Terms & Conditions" (T&C document NOT opened). Access needs ESA credentials (I have none). Therefore: local use only until the owner reads the T&C; nothing in `data/`, the site or an artifact.
- Independent of: Copernicus DEM (reference only); ICESat-2 ATL06 is used inside the ATBD as its validation set (2019-2022).
- Read: website pages (home, product overview, point, gridded, Baseline 3 news) read; handbook and ATBD extracted and searched (Central Europe, Alps, Aletsch, licence, DOI, tiles, access) with the relevant paragraphs read; no data file downloaded; Aletsch tile coverage (tile shapefile inside the monthly archives) NOT checked; number of points over Aletsch NOT counted.
- Notes: the handbook and the pages never name Aletsch or the Alps; "Central Europe" is the RGI-7 based region name.

### Dubber et al. (Earthwave, University of Edinburgh, ESA), "Monitoring glaciers with CryoSat-2 altimetry – opportunities and challenges", ESA Living Planet Symposium 2025 — role: context
- Where: https://lps25.esa.int/lps25-presentations/presentations/377/dubber_update.pdf (21 slides; downloaded; the server certificate failed verification, so it was fetched with certificate check off; public slides, read only).
- Content (exact wording from the slides): title slide image labelled "Aletsch glacier, Swiss Alps"; slide 13: "All of CryoSat-2's SARin mode, which covers over 99% of global glaciers" and "Scandinavia, Central Europe, Western Canada & US, Low Latitudes and New Zealand" as new regions; slide 15 "Central Europe: 130,000 high-quality elevation measurements of glaciers in this region in 2019." (CryoTEMPO EOLIS elevations compared with ICESat-2 ATL06). Slide 17 gives "1.7 million" for **Scandinavia**, not Central Europe (an earlier search summary mixed these up). Slide 11 lists Alpine Glaciers (RGI 11-01) among examples of small glaciers and complex topography as the hard case for swath processing. Slide 14: reference DEMs Copernicus GLO-90 (shown for New Zealand and Scandinavia).
- Licence: conference slides, none stated.
- Read: all 21 slides (text; figures not viewed as images). The numbers are not for the site unless checked against the product.

### Jakob & Gourmelen 2023 (GRL 50(8), doi 10.1029/2023GL102954) and Zenodo 7740808 — role: context
- Dataset "10-year glacier mass changes from CryoSat-2 radar altimetry", https://doi.org/10.5281/zenodo.7740808 (2023-03-16), licence field on Zenodo: **cc-by-4.0** (API record read). Files: dhdt and errors GeoTIFFs for Arctic Canada North/South, Greenland periphery, Iceland, Svalbard, Franz Josef Land, Novaya Zemlya, Severnaya Zemlya, Southern Andes, Antarctic periphery, 2010 to 2020, 500 m. **No Alps / Central Europe file.**
- Read: Zenodo record and file list read; the paper itself NOT READ (Wiley 403); its region list is therefore known only from the dataset record.

### GlaMBIE phase-2 abstract EGU26-9325 (Guyez et al.) — role: context
- https://www.egu26.eu/EGU26-9325.html (read): ASTER DEM differencing vs CryoSat-2 altimetry; test sites are Icelandic ice caps, not the Alps. Exact wording: dDEM gave "more negative values in all glacier regions with an average regional difference of 0.08 ± 0.07 m w.e. yr-1" (first GlaMBIE phase 2022-24). Relevance: the Hugonnet et al. 2021 elevation changes (ASTER) used for Aletsch may differ systematically from CryoSat-2 values; do not mix them without this caveat.

### cryoswath (software) — role: tool, not data
- https://github.com/j-haacker/cryoswath (read README via page reader): MIT; Zenodo 10.5281/zenodo.14825358 (concept DOI); processes CryoSat-2 SARIn L1b swaths to elevation-change maps; needs ESA credentials (MAAP / science server) and NASA Earthdata for RGI. README: "Most testing and validation has focused on the Arctic." Alps not mentioned. Could produce an own Aletsch series (local experiment); not attempted.

### CryoSat+ Mountain Glaciers (ESA STSE) — role: context
- https://eo4society.esa.int/projects/cryosat-mountain-glaciers/ (read): prime contractor University of Edinburgh; subcontractors Earthwave, ENVEO, ISARDSAT, MSSL-UCL; lists 11 papers (none about the Alps); no datasets, no licence.

### Other CryoSat-2 items seen only in search results — NOT READ
- Haacker et al., "Systematic errors observed in CryoSat-2 elevation swaths on mountain glaciers and their implications" (ResearchGate 403); Austfonna validation, Remote Sensing of Environment (2021) doi not opened (snippet: swath bias "between 1 and 1.5 m" of penetration); Gourmelen et al. 2018 (doi 10.1016/j.asr.2017.11.014). Three web searches found **no study of CryoSat-2 on Great Aletsch Glacier**; this is not proof that none exists.

### ERA5 (hourly, single levels) — climate reanalysis — role: context / covariate (modelled, not a measurement)
- Where: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels ; DOI 10.24381/cds.adbb2d47.
- Resolution / period (CDS page): 0.25° × 0.25° (atmosphere) regular lat-lon grid, hourly, 1940 to present. The page states that the "data set presented here is a regridded subset of the full ERA5 data set on native resolution" and that early-release ERA5T data "could be different from the final release 2 to 3 months later". (A third-party page, the EQC site, dates the product "1979"; the CDS page was taken as authoritative.)
- Licence: CDS page "CC-BY" (CDS licence page: "released for use under the CC-BY licence", legal text at creativecommons.org/licenses/by/4.0). Commercial use is not addressed on the CDS page; CC BY allows it.
- Read: CDS page via page reader. No data downloaded (needs a free CDS account, which the owner would create; credentials never in chat).

### ERA5-Land — climate reanalysis over land — role: context / covariate
- Where: https://cds.climate.copernicus.eu/datasets/reanalysis-era5-land ; DOI 10.24381/cds.e2161bac. CDS page: 0.1° × 0.1° regular grid, "The native resolution is 9 km", January 1950 to present, hourly, updated daily; licence CC-BY. Page says nothing about glaciers.
- Read: CDS page via page reader only.

### Papers that use ERA5 at or near Aletsch — role: context
- **Rückamp et al. 2026, The Cryosphere 20, 2999-3024, "Future Retreat of Great Aletsch Glacier and Hintereisferner"**, https://doi.org/10.5194/tc-20-2999-2026 (full PDF downloaded, 26 pages, searched). Exact wording: ERA5 reanalysis "on a 0.25° spatial and daily temporal resolution", 1961 to 2023; "For GAG, observed precipitation time series are taken from Lauterbrunnen (815 m a.s.l.) and air temperature from Jungfraujoch (3571 m a.s.l.)"; "For the selected ERA5 grid cell (2246 and 2175 m a.s.l. for GAG and HEF, respectively), we use a temperature lapse rate and a precipitation gradient"; "A similar correction is performed for the ERA5 data closest to GAG. A temperature bias of +2.16 °C is derived." The **GAG precipitation sentence is incomplete in the paper** ("a mean annual sum of mm during our reference period 1961–1990"), so no GAG precipitation figure can be quoted. **The "+1.49 °C" in an earlier search snippet belongs to the Hintereisferner / Vent comparison ("a cold bias of ERA5 of −1.49 °C compared to the reference station in Vent"), not to Aletsch.** GLAMOS (2025) is the mass-balance source. Data statement read: simulation results Zenodo 10.5281/zenodo.15234334; ERA5 not listed there; no licence given for those datasets. Role: gives one documented ERA5 temperature bias for the Aletsch cell (a model setup of the authors, not a general correction).
- Anilkumar et al. 2023, The Cryosphere 17, 2811, https://tc.copernicus.org/articles/17/2811/2023/ (read to char 100000 of 126505): ERA5-Land monthly means (doi 10.24381/cds.e2161bac) as predictors for point mass balance of the RGI "Alps" second-order region from WGMS FoG (doi 10.5904/wgms-fog-2021-05); Aletsch not mentioned; no bias correction applied. Exact wording quoted from the paper: "there is a positive bias in the precipitation variables" (citing Wu et al. 2023) and "the magnitude of the values is not well represented" for temperature (citing Zhao and He 2022). Code github.com/RituAnilkumar/pt-gmb-ml, licence not stated.
- Search results only, NOT READ: Meer et al. 2026, "Glacier Mass Balance Modeling Using a Long Short-Term Memory Network", doi 10.1029/2026JH001250 (snippet: ERA5-Land monthly 2 m temperature, total precipitation, forecast albedo; evaluated against GLAMOS distributed balance; Aletsch tongue less negative than GLAMOS); the 2025 "minimal machine-learning glacier mass balance model" (TC 19, 805; ERA5-Land vs MeteoSwiss comparison, 20 of 28 sites vs 23 of 28 — figures from a search summary, not verified).
- GLAMOS files read locally: a text search of the local Aletsch experiment folder found no mention of ERA5 (only in the Hugonnet paper text). Whether GLAMOS forcing ever uses ERA5 is not established.

## Data types checklist (this file's scope: Glaciers_cci, CryoSat-2, ERA5)
- [x] outlines every epoch: Paul 2020 gives 2015-08-29 (found, read); Glaciers_cci database has no Alps outline entry.
- [ ] length change: not in scope of these three.
- [ ] glacier-wide balance: not in scope; ERA5 papers above use GLAMOS (2025).
- [ ] elevation-band balance: not in scope.
- [ ] point/stake/camera: not in scope (local ledger has GLAMOS point data).
- [x] volume / geodetic: Glaciers_cci has none for the Alps; CryoSat gives point elevations only (no gridded Central Europe product); no Alps CryoSat dataset on Zenodo.
- [ ] thickness: not in scope.
- [x] elevation models with survey dates: CryoTEMPO reference DEM is Copernicus DEM (dates not read); no DEM from these families.
- [x] altimetry: CryoSat-2 CryoTEMPO point product (Central Europe, from Baseline 2: July 2010; coverage over the tongue not counted).
- [ ] ice speed: Glaciers_cci velocity entries contain no Alps entry; other speed sources in the local ledger.
- [x] snow/firn/ELA, climate: ERA5 and ERA5-Land (not downloaded).
- [ ] imagery geometry: not in scope.
- [x] papers about this glacier: Rückamp et al. 2026 read; the others partly, see above.
- [ ] field data: not in scope.
- [ ] names and facts: not in scope.

## Assessment: is CryoSat-2 added value for the Aletsch tongue? (2026-10-30, judgement, not measured)
Probably little; low priority. Against: narrow tongue and a footprint of a few hundred metres (ESA slides list Alpine glaciers, RGI 11-01, among the hard cases); swath precision "roughly 1 to 2 m" (search snippet of a mountain-glacier paper, NOT READ); radar penetration into snow/firn (Bannwart et al. 2024, local ledger), so no radar height as an absolute surface on ice; ICESat-2 is far more precise and 64 ATL06 granules already cover the tongue box; airborne DEMs (2011, 2017, 2023) are better anchors; Central Europe has no gridded product, points only; licence unresolved, so local, validation-only use. For: monthly density since 2010-07 between DEM dates, independent of clouds; a possible glacier-wide dh/dt check on GLAMOS/Hugonnet (weak, penetration is worst in the accumulation area); the ASTER-vs-CryoSat offset (GlaMBIE, EGU26-9325) as a caveat for Hugonnet values.
**Decision test (not yet run):** after the ESA account and T&C question is settled, download a few months of CENTRALEU point tiles, count the points inside the tongue box, compare with swissALTI3D on stable terrain. If only a handful of points per year fall on the tongue, drop CryoSat for Aletsch.
**Credentials:** none for ESA Earth Online / science-pds.cryosat.esa.int found. scripts/.cdse-credentials is Copernicus Data Space; ~/.netrc holds only urs.earthdata.nasa.gov. Owner was asked for the path of the ESA credentials file (2026-10-30).

## Snow line, albedo and melt timeline from imagery (started 2026-10-30; details in experiments/aletsch-snow-melt/PLAN.md)
- **Catalogue (read via STAC):** Sentinel-2 L2A at CDSE STAC: 1631 items in the Aletsch box 2015-06 to 2026-10, 1617 cover the glacier core. Landsat Collection 2 L2 at Planetary Computer: 3911 items 1984 to 2026, 2530 cover the core (Landsat 4: 28, 5: 1471, 7: 1208, 8: 889, 9: 315 in the box). Planetary Computer licence field reads "proprietary" (terms not opened); access with an anonymous SAS token. Some S2 acquisitions exist twice (PB 04.00 and 05.10).
- **Method sources read:** Rabatel et al. 2013, The Cryosphere 7, 1455 (PDF, text searched; Aletsch not in its 43 western-Alps glaciers); THEIA annual ELA product page (240 Alpine glaciers, 2000-2016, maximum snow line altitude as ELA indicator; Aletsch inclusion NOT checked; licence NOT read); Liang 2000, RSE 76, 213 (author's PDF, Eq. 11 read); Weisseespitze TC 19, 3329 (page, to char 100000 of 169684). NOT READ: Naegeli et al. 2017 full text (MDPI blocked the request; the UniFR repository link returned 404; no workaround attempted), Rastner et al. 2019 (ASMAG), Kropacek and Mehrishi 2024, the FROST 2026 brief communication, any Sentinel-1 wet snow paper (search summaries only).
- **Validation data (independent of the scenes):** GLAMOS ELA and AAR for B36-26, 1914-2024, in massbalance_fixdate.csv; GLAMOS says the data are for scientific and non-commercial use. The ELA is from the reanalysed balance (Huss 2015), not a direct observation.
- **Weather and runoff leads, not yet read:** MeteoSwiss open data (opendatadocs.meteoswiss.ch; "Source: MeteoSwiss"), FOEN Hydrodaten station 2161 Massa - Blatten bei Naters (hydrodaten.admin.ch), SLF IMIS, ERA5 pressure levels.

## Weather and runoff sources for Aletsch (read 2026-10-30; role: forcing and independent melt check for the between-anchors model, never a source of GLAMOS-independent mass balance)
Circularity note: GLAMOS's reanalysed balances are built from Swiss station weather; correlation between them and these series is not independent evidence.

### MeteoSwiss Open Data, SwissMetNet stations (daily files read) — role: constraint (temperature forcing)
- Where: https://opendatadocs.meteoswiss.ch ; files https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn/<station>/ogd-smn_<station>_d_historical.csv (and _recent, _h_, _t_); STAC https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-smn ; station metadata ogd-smn_meta_stations.csv (downloaded, 152 KB), data inventory (927 KB).
- Licence (terms page read): "The 'Open Data' of MeteoSwiss are published accordingly under the Creative Commons Licence CC BY 4.0"; may "be reused without restriction"; share and process "for any purpose, even commercially"; source must be acknowledged ("Source: MeteoSwiss"). Allows the site's non-commercial and commercial use.
- Stations near Aletsch from the metadata file (distance from 46.50 N, 8.05 E, computed): Jungfraujoch JUN 3571 m, data since 01.01.1931, 7.2 km; Eggishorn EGH 2892 m, since 20.10.1993, 8.8 km; Binn BIN 1479 m, 18.3 km; Blatten Lötschental BLA 1548 m, 19.2 km; Ulrichen ULR 1346 m, 19.8 km; Grimsel Hospiz GRH 1980 m, 23.1 km (owners as listed: MeteoSchweiz; ULR and GRH also SLF).
- Daily files read (tre200d0 = air temperature 2 m daily mean; column set printed in the file header): JUN tre200d0 1933-01-01 to 2026-10-29, n 34270, no gaps since 1990; EGH 1993-10-21 to 2026-10-29, n 11421, 1.9 % missing since 1990; GRH 1932-01-01 to 2026-10-29 (n 34636); ULR 1981 to 2026. **No precipitation (rre150d0) in the JUN or EGH daily files.** Precipitation: GRH rre150d0 1868-01-01 to 2026-10-29 (n 36240); ULR 1981 to 2026. Automatic snow depth (htoautd0): GRH and ULR from 2009-02-01 only. Global radiation (gre000d0): JUN from 1981, EGH from 2012-03-27, GRH from 1989-05-01. All counts are from the downloaded files; a pandas date parse, not a quality check.
- Notes: Eggishorn (2892 m) sits next to the glacier at an elevation close to the equilibrium line (GLAMOS ELA 2023-2025: 3215, 3155, 3175 m, from massbalance_fixdate.csv, years named after the year they end in) and is the best single temperature record for the melt zone; JUN is above it. A lapse rate between JUN, EGH and the valley stations is to be fitted (computed). EGH starts only in 1993, so earlier years need JUN or GRH plus the fitted difference. Homogenisation breaks and sensor changes NOT checked (MeteoSwiss recommends its homogeneous series for trends).

### MeteoSwiss gridded daily temperature and precipitation (TabsD, RhiresD) — role: context / alternative forcing
- Where: STAC collection https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-surface-derived-grid, item `archive-ch` with 3257 assets, yearly NetCDF files such as `ogd-surface-derived-grid-archive.rhiresd_ch01h.swiss.lv95_19610101000000_19611231000000.nc` (RhiresD from 1961 in the listing; TabsD files exist in the same item, start year NOT checked). Page (read): 1 km grid, LV95, NetCDF, yearly files up to about 200 MB; "estimated statistically", "pseudo observations"; no uncertainty quantified on the page; same CC BY 4.0 / "Source: MeteoSwiss" terms. Precipitation reconstructions "back till 1864" (page wording). Files themselves NOT downloaded or opened.
- Caveat to test: station-interpolated precipitation is thin at glacier altitudes; compare against the GLAMOS winter balance before using.

### FOEN Hydrodaten station 2161, Massa - Blatten bei Naters — role: validation (melt check, integrated over 196 km2)
- Where: https://www.hydrodaten.admin.ch/en/seen-und-fluesse/stations/2161 (page read). Page wording: discharge 1922 to today; water level 1974; temperature 2003; turbidity 2022; catchment area 196 km2; glacierised share 56.5 %; mean catchment altitude 2937 m a.s.l.; station altitude 1446 m a.s.l.; coordinates (Swiss grid) 2'643'694 / 1'137'291; the page warns that winter readings can be strongly distorted by icing ("Die aktuellen Daten können im Winter durch Vereisung der Anlage stark verfälscht sein"). Flood-statistics PDF (read): "Die Hochwasserspitze vom 30.7.1913 wurde durch einen Gletscherseeausbruch verursacht"; evaluation starts with the limnigraph installation 07.04.1922. Low-flow report (read): catchment 196 km2, analysis period 1922-; no statement on regulation found in either report.
- Historical series (daily means, extremes; 5-, 10-minute or hourly continuous data since 1974): **ordered, not downloaded**: order form or hydrologie@bafu.admin.ch, processing "can take several days"; deliveries "in der Regel kostenlos". Hydrological Atlas of Switzerland plate 37 (read): station Massa - Blatten bei Naters in operation from 1965, earlier station Massa - Massaboden 1922-1965 (so the 1922-1965 series is a different gauge: homogeneity to be asked).
- Licence (terms PDF "Liefer- und Nutzungsbedingungen für hydrologische Daten des BAFU", Stand 13.7.2020, read in full): "Die gelieferten Daten stehen zur freien Nutzung zur Verfügung. Der Kunde darf die Daten zu kommerziellen und nicht kommerziellen Zwecken verwenden. Die Angabe der Quelle wird empfohlen." Allows our use.
- **Open: is the flow natural?** The Massa is dammed by the Gebidem reservoir (Alpiq: 1436 m, about 9.2 million m3 per a search summary of an Alpiq PDF, NOT opened). The station altitude (1446 m) is close to the reservoir level, so it is probably above the dam, but whether diversions or intakes upstream change the measured flow is NOT established. Ask FOEN (hydrologie@bafu.admin.ch) for the regime/influence flag of station 2161 before using it as a melt check. Also: 56.5 % of 196 km2 is a computed glacier area of about 111 km2 for the whole catchment (computed), more than Aletsch alone (SGI2016: 78.48888 km2), so runoff is a catchment total, not Aletsch alone.

### SLF IMIS snow stations — role: context (winter accumulation) — NOT READ
- Search results only: SLF measurement API https://measurement-api.slf.ch (live and historical IMIS data), EnviDat dataset https://envidat.ch/dataset/imis-measuring-network, citation DOI https://doi.org/10.16904/envidat.406 requested for scientific use. Station list near Aletsch, variables and terms of use NOT read. MeteoSwiss GRH and ULR (also SLF-owned) already give snow depth from 2009-02.

### ERA5 pressure levels — role: free-atmosphere temperature covariate (modelled)
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-pressure-levels, DOI 10.24381/cds.bd0915c6, 0.25 degree, 1940 to present, "1000 hPa to 1 hPa" in 37 levels (page wording; individual levels not listed there), licence CC-BY. Idea: temperature at the pressure level of the glacier elevation avoids the cell-elevation problem of surface ERA5 (2246 m cell, Rückamp et al. 2026); to be calibrated against Jungfraujoch and Eggishorn. Not downloaded (needs the owner's free CDS account).

## Not read / left out of the site (for the owner)
- CryoTEMPO-EOLIS: ESA Terms & Conditions (READ T&C link on the Earth Online page), any real data file, Aletsch tile coverage and point counts, whether Baseline 2 Central Europe files are still served. Needs your ESA account; licence status therefore unknown → no CryoSat data on the site.
- ESA CCI Open Data Portal and the CEDA record for Glaciers_cci: not opened (JavaScript / HTTP 400); the ENVEO database shows no Alps entry, so little is expected.
- Jakob & Gourmelen 2023 paper (403), Haacker et al. systematic-errors paper (403), Meer et al. 2026 (search snippet only).
- ERA5 / ERA5-Land: no data pulled. A point extraction for the Aletsch cell needs a free CDS account (you create it; credentials only in your terminal).
- Paul 2020 Aletsch outline: not compared with SGI2016 or RGI; unit definition (tributaries) not checked; no figure from it is on the site.
- No figure from this ledger is on the site; every number above is copied from the source as read, and the CryoSat counts (130,000, 1.7 million) come from slides, not from the product.

- **Result (2026-10-30, computed here, local only):** snow-line altitude from the full Sentinel-2 + Landsat catalogue (seasonal maximum, firn class) vs GLAMOS ELA, 40 years: bias +15 m, rmse 163 m, r 0.63. Method, parameters, caveats and rerun commands: experiments/aletsch-snow-melt/PLAN.md (end), snapshot in experiments/aletsch-snow-melt/results_v2/. Not on the site.

## SGI outlines before 2023, read 2026-10-31 (local copies in experiments/aletsch-yearly-dem/glamos/inv; ReadMe, dbf and shapefiles opened)
Aletsch is SGI B36-26 in every release. Dates are the releases' own wording; the ReadMes give no licence text (not re-checked against the landing pages; treated as non-commercial, see CLAUDE.md).

| Release | Source wording | Aletsch attributes read | CRS |
|---|---|---|---|
| SGI 1850 (r1992) | not re-read here | Shape_Area 105617851.049 (m2, as stored) | LV95 |
| SGI 1931 (r2022) | "referring to the mean year 1931 ... based on terrestrial images and historical maps (first edition of LK25)"; attribute `date` = "date of the terrestrial image"; cite Mannerfelt et al. 2022, doi 10.5194/tc-16-3249-2022 | `date` = 1926-09-01 | LV03 (shown in the back-cast editor with the plain +2,000,000 / +1,000,000 offset, not the exact swisstopo transformation) |
| SGI 1973 (r1976) | "referring to the year 1973 ... based on aerial imagery" | Shape_Area 86628451.7189 | LV95 |
| SGI 2010 (r2010) | "referring to the years 2008-2011 ... based on aerial imagery"; Fischer et al. 2014 | two polygons: Shape_Area 78131532.5259 and 226567.112477 | LV95 |
| SGI 2016 (r2020) | "referring to the years 2013-2018" | `year_acq` 2017, `area_km2` 78.48888 | LV95 |

No SGI release has an Aletsch outline for 1984, 1995, 2004 or 2011 specifically. 1973 and 2010 bracket those years; the back-cast editor (experiments/aletsch-backcast) draws 1931, 1973 and 2010 as reference layers. Exact flight dates of 1973 and 2010 are not given in the files read.

### Yearly surfaces, harmonised run of 2026-11-02 (`experiments/swiss-yearly-dem/`, `GLACIER=B36-26`)
- Survey days (flown strip days only, chosen on ICESat-2; `fit.json`): A1 2017-09-21, A2 2023-08-10; lowest pair rmse 2.225 m, leave-one-granule-out 2.225 m; tie within 0.05 m: 2017-09-08 / 2023-08-10; 2017-09-21 / 2023-08-10. Not independent of the check.
- ICESat-2 (leave-one-granule-out): 2272 shots in 9 granules, rmse 2.23 m, bias 0.58 m; with the used days 2.23 m. Per year: 2020 1.64 m (334); 2021 1.71 m (283); 2022 1.84 m (121); 2023 1.38 m (373); 2024 2.40 m (718); 2026 3.10 m (443).
- Uncertainty (`experiments/yearly_uncertainty.py`): sigma_A 1.38 m (rmse of the 373 shots of 2023), sigma_L 1.43 m (rmse of 62 shots within 45 days of the lidar day), k_i 0.119, k_e 0.195; median by year: 2016 1.7, 2017 1.4, 2018 1.4, 2019 1.4, 2020 1.6, 2021 1.7, 2022 1.8, 2023 1.4, 2024 2.4, 2025 2.4; 2026 viewer map median 3.6 m.
- Band balance (`donors.json`, rule: lowest ICESat-2 rmse among the candidates whose bins cover at least 98 % of the ice cells; own bands always win): own 2.23 m, covers 100 %; line 2.06 m, covers 73 %; B83-03 2.08 m, covers 74 %; B56-03 2.20 m, covers 29 %; B43-03 2.09 m, covers 99 %; chosen: own.
- ASTER AST14DEM: 10 of 82 scenes passed the gate (rock NMAD at most 15 m, 300 rock and 200 ice cells); years 2016, 2017, 2019, 2020, 2021, 2022; terms of use NOT read.
- GLAMOS stakes (`stakes_check.py`): 25 stake-years, modelled change = 0.68 of the reading, RMSE 1.05 m.
- Margin fade: none. Earlier numbers in this ledger (uncertainty, ICESat-2 per year, survey days) are superseded by this section.
