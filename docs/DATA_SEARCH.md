# Rigorous source and data search for a glacier (any data type, any region)

**Mandatory for every glacier onboarding** (CLAUDE.md, "When the owner asks in chat to onboard"; `docs/ADD_A_GLACIER.md` step 1). It covers *every* kind of glacier data, not only elevation: outlines, length, volume and mass balance, stakes and point data, ice thickness, elevation models, ice speed, altimetry, papers, field data, photos. It is written from the Aletsch yearly-surface work (October 2026, `experiments/aletsch-yearly-dem/`, local only) but must work for any country: Switzerland, Iceland, Norway, Svalbard, the Alps beyond Switzerland, Georgia, Kyrgyzstan, Pakistan, New Zealand, the Americas.

The rule behind it is CLAUDE.md's: external numbers are copied exactly as the source states them; a figure that cannot be read at the source is left out. **Nothing is carried over from memory or from another region.** Each region has its own monitoring programme, mapping agency and data culture; the search finds them again every time.

**"Rigorous" means:** open every link, run web searches (in English *and* the local language), download and read the files, ReadMes, headers, rows and figures. A search or page summary is a pointer, never a reading. Every source ends in a ledger marked **read** or **NOT READ**, with what was cut off or blocked.

## 1. Fix the question first
Glacier ids (RGI, national inventory, WGMS_ID), the box, the period, the output wanted, and for each source its **role**: *constraint* (fits a model), *validation* (never fitted) or *context*. A source is never both.

## 2. Data types: what to find for each, every time
| Data type | Typical source classes | What to read and record |
|---|---|---|
| **Outlines / area** (every epoch) | national inventory, RGI/GLIMS, regional inventories, papers with dated outlines | acquisition year of the imagery (not the release year), unit definition (ice cap vs outlet), debris cover, centrelines, licence |
| **Length / front variation** | national monitoring programme, WGMS FoG front variation | exact start and end dates per value, "date not exactly known" flags, method, observer |
| **Mass balance** (glacier-wide, seasonal) | national monitoring programme, WGMS FoG, reanalysis papers | hydrological year dates, winter/summer split, method (direct/reanalysed), area used |
| **Mass balance per elevation band** | national monitoring programme | band width, area per band, which years |
| **Point / stake / probing / camera data** | national monitoring programme (a **separate dataset** from glacier-wide), WGMS FoG point tables, research groups | position and quality, elevation datum, date quality, measurement type (stake, probe, GPR, camera), density, error terms |
| **Volume / geodetic change** | national programme (often lists the DEM sources and dates per pair), Hugonnet et al., WGMS annual mass change | DEM source codes, dates, density assumption, uncertainty, coverage |
| **Ice thickness / volume** | GPR campaigns, national thickness datasets, global model ensembles (Farinotti et al., Millan et al.), glacier papers | measurement vs model, year, point density, licence |
| **Elevation models** | national mapping agency (with **real survey dates**), airborne campaigns, ASTER, Copernicus DEM, SRTM, TanDEM-X, ArcticDEM/REMA, Pléiades/SPOT, historical maps | edition year vs survey year, composite areas, datum, resolution, radar penetration, snow cover, independence from other DEMs |
| **Altimetry** | ICESat-2 ATL06, ICESat, GEDI (NASA CMR/earthaccess) | track coverage over the glacier (count first), quality flags, datum, dates |
| **Ice speed** | ITS_LIVE, regional velocity products, InSAR papers | period, resolution, flowline |
| **Snow / firn / ELA / accumulation** | national programme, snowline products, GPR/snow-pit papers | dates, method |
| **Imagery, shadows, photos** | Sentinel-2/Landsat STAC (dates, sun angles), repeat photography archives, webcams (tourist vs research) | acquisition dates, geometry, licence |
| **Names and facts** | national place-name register, Wikipedia with source, papers | every sentence with a source; unknown stays unknown |
| **Learned products** (embeddings) | vendor catalogues | not measurements; covariates at most, labelled as modelled |

## 3. Region discovery: finding the right sources in a country you have not worked in
Do this first for every region; the answer differs per country. What the repo already holds is only a starting point: `docs/SOURCES.md`, `walkthrough/outline-sources.json`, `data/regions/<region>/`, `docs/ADD_A_GLACIER.md` (section 1 table). Treat those entries as leads, check them again, then dig further.

1. **Who monitors glaciers there?** Look up the national programme and the research groups: the WGMS Fluctuations of Glaciers metadata for that glacier or region (it names investigators and sponsoring agencies and gives the WGMS_ID), WGMS national correspondents, the RGI/GLIMS inventory contributors for the region, review papers on the region's glacier change, and the authors of the regional papers you find.
2. **National mapping agency:** its open elevation-model and orthophoto catalogue, with release notes and tile or flight-strip metadata for the survey dates.
3. **National hydrological, meteorological or polar institute:** often the owner of the monitoring series and the inventory.
4. **Universities and research institutes** with long series.
5. **Regional intercomparison and compilation datasets** (e.g. the RAGMAC glacier mass-change experiment sites; regional geodetic studies).
6. **Search by identifier:** the glacier's RGI id, WGMS_ID and national id in Zenodo, PANGAEA, Dataverse, university research collections, NASA CMR, and in the national geoportal.
7. **Search in the local language.** Build the term list from the local-language Wikipedia title for "glacier", the national agency's own wording, and the glacier's local name variants; do not guess. Starting vocabulary to verify, not facts about sources: Gletscher / Ferner / Kees (German-speaking Alps), glacier (French), ghiacciaio (Italian), vadret (Romansh), jökull (Iceland), bre / isbre / jøkul (Norway), glaciar (Spanish), ледник (Russian), мөңгү (Kyrgyz), მყინვარი (Georgian). For each, combine with mass balance, length change, thickness, DEM, inventory, monitoring, stakes.
8. **Data hosts to check by default:** the programme's own DOI host, WGMS, Zenodo, PANGAEA, national research collections, NSIDC, NASA CMR, Copernicus, the national geoportal's STAC or identify API, ArcticDEM/REMA/ITS_LIVE where they apply.
9. **Write the region note:** a short "who holds what" section at the top of the region's ledger, so the next glacier of that region starts from verified leads.

Known starting points from this repo and this work (each still to be re-read per glacier):
- *Switzerland:* verified in the Aletsch work: GLAMOS (separate DOIs for glacier-wide balance, elevation-bin balance, **point mass balance**, length change, volume change, inventories, ice thickness), swisstopo (swissALTI3D, swissSURFACE3D, SWISSIMAGE, flight-strip and tile metadata), the SGI inventories.
- *Iceland, Norway mainland, Svalbard and the other regions:* leads only, from `docs/ADD_A_GLACIER.md` and `walkthrough/outline-sources.json` (for example the Icelandic Met Office outlines, NVE, the Norwegian Polar Institute, ÍslandsDEM, Kartverket, ArcticDEM, ITS_LIVE). These were not searched with this procedure; the first onboarding of each region does it and writes the region note. Do not assume any of them offers stake, volume or thickness data.

## 4. How to read a source
- **Pages:** list every `href` with `curl` and open each one; do not trust a rendered summary. For dynamic pages look for the catalogue or JSON-LD API behind them.
- **DOIs:** resolve each one. A DOI printed in an author manuscript can be dead (Hugonnet et al. 2021's Zenodo DOI returned 404; the data are at 10.6096/13). Use the repository API (Zenodo `/api/records/<id>`, CMR via `earthaccess`, STAC, the geoportal's identify API).
- **Files:** download, unzip, read the ReadMe in full, then header and sample rows, then the rows of your glacier. Parse carefully (a comma inside a text field breaks naive CSV readers; some programmes add a citation preamble and a units line).
- **Licences, everywhere they can appear:** landing page, file header, ReadMe, repository record. They can disagree (GLAMOS: CC BY 4.0 on landing pages, non-commercial in file headers; RAGMAC airborne DEMs: CC BY on Zenodo, "INTERNAL USE ONLY AND CANNOT BE MADE AVAILABLE WITHOUT ALLOWANCE BY DATA PROVIDER" in each ReadMe). The stricter one wins until the owner decides. Such data never go into `data/`, the site or a published artifact.
- **Figures and PDFs:** render with `pymupdf` and read text and image.
- **Big archives:** read the zip central directory by HTTP range request and fetch only the members you need (`fetch_member.py` in the Aletsch experiment); check sizes first.
- **Papers:** get the full text (author manuscripts, institutional PDFs), search it for data, dates, numbers, penetration/snow remarks, **data availability**; follow every data DOI; quote exact wording in the ledger.

## 5. The ledger: `docs/sources/<region>-<glacier>.md`
Use `docs/sources/TEMPLATE.md`. Per source: name and DOI/URL, **exact date wording** (and what placeholders such as `9999` mean), composite areas, datum, resolution, licence (all places), independence from other sources, role, **read / NOT READ**. Conflicts between files are flagged, not resolved silently. Computed values are labelled computed. What could not be read is left out of the site and listed for the owner. Numbers derived from restricted-licence data stay in local notes (`experiments/`), not in the tracked ledger.

## 6. Traps found in the Aletsch work (they apply everywhere)
- A national programme's datasets have **separate DOIs** per data type; the downloads page may list only some (GLAMOS point data was missed on a first pass).
- Edition year is not survey year; a "2017 DEM" can be a composite of four dates and the same product as another anchor (not independent). A DEM labelled with one year can hold older data in places; test every DEM against an independent referee.
- Datums: national orthometric heights, ellipsoidal heights (ICESat-2, GEDI), EGM96 (ASTER, RAGMAC). Convert and verify on stable terrain.
- **Radar** (TanDEM-X, SRTM, Copernicus DEM): penetration into snow and firn (Bannwart et al. 2024: up to 8 m above 3400 m in March; below the ELA the bias follows snow depth). Rules: no radar height as an absolute surface on glacier ice; same-season, snow-free differences only, with a fitted offset carried as uncertainty; Hugonnet et al. excluded radar on glaciers.
- Optical DEMs: snow-cover shifts (Hugonnet et al.: typically below 2 m); 3-D co-registration on stable terrain; weight by slope and correlation quality.
- Stakes read the ablation of the moving ice, not elevation change at a fixed place.
- ASTER dates from file names: trust the day, not the hour.
- Cast shadows (Pfau et al. 2023): simulate first how much of the area is ever shaded; on a south-facing valley floor it can be under 1 %.
- Manuscript data statements go stale; check the repository, not only the paper.

## 7. Checks that paid off
Coverage map of what exists where; pairwise DEM differences on stable terrain and on ice; a referee dataset (ASTER) for suspicious DEMs; a feasibility simulation before pixel work; held-out validation (never the sources used in the fit); a derived ratio checked against an independent measurement.

## 8. Practicalities
- Credentials are typed only in the owner's terminal (`set_credentials.py` writes `~/.netrc` and `scripts/.cdse-credentials`), never in chat; `check_credentials.py` prints only OK or FAILED.
- Keep command output short; long output goes to log files.
- Restricted-licence material stays in `experiments/` (gitignored) and is marked local only.
- Update the ledger when a source appears or changes, and the memory notes (`reference_*_sources.md`).
- Reusable code, local for now, in `experiments/aletsch-yearly-dem/`: `altimetry.py` (ATL06/GEDI by range), `fetch_member.py` (remote zip members), `glamos_bins.py`, `anchors.py`, `aster_xdem.py`, `shadow.py`, `map_coverage.py`, `build_map_html.py`. Move what is generic into `scripts/` before relying on it for another glacier.
- Yearly ice-surface models of a tongue (anchors, survey days, validation, bed, lakes, viewer): **docs/YEARLY_DEM_METHOD.md**.
