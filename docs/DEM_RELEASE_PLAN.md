# Releasing the yearly ice surfaces: licence audit and validation plan

Status 2026-10-29. Scope today: lowest 8 km of the Aletsch tongue, 2016 to 2026 (`experiments/aletsch-yearly-dem`, gitignored) and the 1984 reconstruction (`experiments/landsat-dem-1984`). Sources, dates and read status are in `experiments/aletsch-yearly-dem/LEDGER.md` (the ledger is the authority; this page only draws the consequences). Nothing here has been published.

Route: freeze method, validate, preprint (EGUsphere / EarthArXiv), dataset on Zenodo (DOI, CITATION.cff), data-description paper (ESSD; its data policy and licence rules to be read from the journal page before submitting, not assumed).

## 1. Licence audit

Verdicts: **OK** = may go into a released dataset with the stated credit; **NC** = forces a non-commercial output licence; **BLOCKED** = may not be released or derived from without the provider's permission; **UNREAD** = licence not read at the source, so it stays out until read.

| Input | Used for | Licence as read | Verdict |
|---|---|---|---|
| swissALTI3D 2019 and 2023 editions, swissSURFACE3D raster 2021 (swisstopo STAC) | the three anchors | swisstopo OGD terms, read: may be "enriched and processed and also used commercially. A reference to the source is mandatory" (credit "©swisstopo") | **OK** |
| GLAMOS elevation-band balances, volume change, length change | shape and size of the yearly change | file headers: scientific and non-commercial use; DOI page says CC BY 4.0 (CLAUDE.md: treat as non-commercial) | **NC** (output inherits it unless GLAMOS agrees otherwise) |
| GLAMOS 2026 glacier-wide balance | 2026 surface | read off a figure (vector path), not a data file | **Do not release 2026** until GLAMOS publishes the number; label as read from a plot |
| GLAMOS point mass balance (stakes, cameras) | check only | landing page CC BY 4.0 | OK as validation (credit GLAMOS); treat as NC if used as constraint |
| GLAMOS inventories (SGI) | outlines, masks | CC BY 4.0 (CLAUDE.md) | OK |
| RAGMAC airborne DEMs 2009, 2011, 2017 (Zenodo 12620977) | local validation | Zenodo label CC BY 4.0, but the readmes of 2009 and 2017 say INTERNAL USE ONLY, not to be made available without the provider's allowance; the 2011 readme carries the same line | **BLOCKED**: no pixels, and I would also ask before publishing error statistics against them |
| RAGMAC ASTER DEMs 2000 to 2021 and the thinning curve derived from them | profile F(z) | same Zenodo record; the ASTER files' own terms not read | **UNREAD** |
| ICESat-2 ATL06 v007 | independent check | NASA licence not read | **UNREAD** (very likely open; confirm on the NSIDC page) |
| Sentinel-2 L2A | margin, drape | Copernicus: commercial use allowed (CLAUDE.md) | OK, credit Copernicus |
| Landsat | 1984 margin | not read in the ledger | **UNREAD** |
| Hugonnet et al. 2021 (doi 10.6096/13) | context, comparison | dataset licence not verified from the source | **UNREAD**; may cite the article, not redistribute |
| ETH TanDEM-X Aletsch (doi 10.3929/ethz-b-000482456) | would constrain 2016-2019 | DataCite record says CC BY 4.0; files never fetched | not used |
| Pfau et al. 2023 (shadows) | method tried | data licence field empty; code Zenodo CC BY 4.0, GitHub none | method cited only; no usable constraint found |
| Bannwart et al. 2024 data (Zenodo 11071899) | winter validation idea | licence field empty | **UNREAD**, not used |

### Consequences

1. **Anchor on swisstopo directly, never through the RAGMAC copies.** The 2017 "airborne" file is the swissALTI3D 2019 edition itself; fetching it from swisstopo STAC removes the INTERNAL USE problem for the anchor.
2. **The output licence is NC unless GLAMOS agrees to more.** The GLAMOS balance shapes every yearly surface. Options: (a) release CC BY-NC 4.0 (consistent with the site), (b) ask GLAMOS (Matthias Huss is the contributor of the dated surveys and point data) for permission to release under CC BY 4.0, which also unlocks the 2009/2011/2017 validation. Whether ESSD accepts NC data must be read from its data policy.
3. **Validation without BLOCKED data.** The paper must stand on ICESat-2, swisstopo leave-one-out, GLAMOS stakes and cameras, unless GLAMOS permits the airborne DEMs. This is your earlier decision (2026-10-28, keep them local); the paper is the reason to revisit it.
4. **Read before release:** ICESat-2, Landsat, ASTER/RAGMAC terms, Hugonnet licence. Anything unread is dropped from the released product and listed.

## 2. Validation plan

Numbers below are our own computed results from the experiment notes, not external figures.

| Experiment | State | Note |
|---|---|---|
| ICESat-2 leave-one-group-out CV | done: RMSE 2.08 m (v0 3.37, site recipe 4.49, line 3.11) | independent of the anchors; keep as headline, add bias and per-year, per-elevation breakdown |
| 1984 back-test 2017 to 2023 | done: 21 % RMSE of the mean (generic Huss delta-h 47 %, biased on the tongue) | front remains uncertain in the lowest 3 km; say so |
| **Leave-one-anchor-out** (predict the 2021 lidar from 2017 and 2023 alone, and each other combination) | **missing, most important** | tests the interpolation claim directly with a dense reference |
| **Hindcast of extrapolation** (fit up to year Y, predict Y+1 to Y+3) | missing | needed to justify 2024 and later, which lie beyond the last anchor |
| Stake and camera comparison (GLAMOS point data, 2206 to 2635 m) | data read, not yet compared | cheap; covers the upper tongue |
| Baselines in the same table (linear in time, Huss delta-h, scaled GLAMOS) | partly (site recipe, line) | add Hugonnet-style if its licence/data can be read |
| Per-pixel uncertainty and its calibration (does a 1-sigma band cover about 68 % of held-out shots?) | missing | required before an uncertainty layer is shipped |
| Sensitivity to the free parameters (d1, d2, density 850, anchor dates spread over Aug to Oct 2021) | missing | tabulate effect on volume and on the tip |
| Per-cell survey dates of the anchors | 8 lidar tiles read, rest in a background job; LUBIS strips not queried | needed for the provenance layer |
| Second glacier | missing | otherwise state in the title and abstract that the method is demonstrated on one tongue |

## 3. Product definition (draft)

Per glacier and year: surface elevation (GeoTIFF, LN02 or ellipsoid stated, not mixed), 1-sigma uncertainty, class layer (observed anchor, interpolated, extrapolated, reconstructed), anchor date/source layer, density and datum in the metadata; yearly values are for the date the picture shows (late summer), not 30 September unless said. Versioned on Zenodo; `CITATION.cff`; credits: ©swisstopo, GLAMOS, Copernicus, plus the unread sources once read.

## 4. Decisions for the owner

1. Output licence: NC as is, or ask GLAMOS for CC BY?
2. Revisit "airborne DEMs local only" (affects validation)?
3. Scope of the first release: Aletsch tongue only, or add a second glacier first?
4. Include 2026 (figure-read) or stop at the last published balance year?
5. Authors and a GLAMOS/swisstopo acknowledgement or co-author.
