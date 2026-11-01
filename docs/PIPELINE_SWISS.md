# Swiss glaciers 2 to 10: the Aletsch pipeline, repeated

Decided with the owner 2026-10-31. Aletsch (B36-26) is the finished model: every glacier gets what Aletsch has, in the same way. Order: largest first
(Gorner B56-07, Fiescher B40-07, Unteraar A54g-11, Corbassière B83-03, Zmutt B57-05, Rhone B43-03, Findel B56-03, Fee B53-04, Trift A54e-24).
Placement of all nine goes first and together; scenes, modelling and QA go glacier by glacier. State per glacier: `data/pipeline/<id>.json` (stage, date, checks, numbers).

Rules that apply to every stage: external numbers verbatim (CLAUDE.md); imagery of Sentinel-2 and Landsat is not altered except by the documented, labelled steps
(Landsat 7 stripe fill, colour matching, the optional SR layer); a source that was not read is left out and listed; Claude never writes a sign-off or a confirmation;
a piece that cannot exist is excused in `data/audit-exceptions.json` with the reason; nothing is published without the owner's word.

## What Aletsch has (the checklist; every row is a piece of every glacier)
| Piece | Where | Stage |
|---|---|---|
| Picture box, tip, 3D strip, start camera | record `placement` (`data/regions/ch/<g>/glacier.json`) | 1 owner |
| Sentinel-2 scene per year 2016 to now, one orbit, cloud masks | `data/scenes.json`, `data/cloudmasks.json` | 2 owner |
| Landsat 1984 to 2015: picks, registration, colour reference patch, three styles, Landsat 7 stripe fill | `data/landsat/`, `scripts/landsat-picks.json`, `build_landsat.py` | 2 owner |
| Oldest aerial photograph | `data/oldest/` | 3 |
| Yearly 3D surfaces, bed, uncertainty, lake flattening, science mode, provenance | `data/yearly/<id>.npz/.json`, baked terrain bundle | 3 |
| Super-resolved picture layer (SEN2SR, optional, off by default, labelled) | `data/sr/<id>/` | 3 |
| Ice speed layer, card, pin, click history | `data/itslive/<id>.json` | 3 |
| Outlines, radar thickness, cross-section, volume and balance cards | `glaciers.js`, `thickness.js` | 3 (check) |
| Historic photos ("Then and now"), Street View ids, trails, peak names | `photos.json`, `streetview.json`, trails | 3 |
| Source search ledger | `docs/sources/switzerland-<glacier>.md` | 3 |
| Texts, credits, sources list, board, tests | `IC_INFO`, `gfn`, board | 4 |

## Stages
0. **Make it repeatable (Claude).** The Aletsch experiments (`experiments/aletsch-yearly-dem/strip_inputs.py`, `strip_model.py`, `export_site_yearly.py`,
   `experiments/aletsch-sen2sr/run_strip.py`) take the glacier from its record; one runner `scripts/tsf_glacier.py <id> <stage>` with the state file.
   Aletsch is re-run first and must reproduce what is on the site.
1. **Placement, all nine together (owner).** `python3 scripts/placement_sheet.py` makes `scripts/.placement/index.html`: per glacier the proposal from the rule
   (`icecap_lib.derive_view`) in the real 3D view (Mapterhorn terrain) and in plan view (hillshade, outline, picture box, strip, tip). The owner clicks OK or gives one line
   (or drags in `scripts/tools/box-editor.html`). The owner's sign-off is the confirmation of the strip step in the walkthrough (`glacier.strip`, standalone: it does not wait for the earlier steps); `review.html` is not used for this.
   Nothing else starts for a glacier before its strip is confirmed. Start camera: `scripts/tools/view3d-editor.html`.
2. **Scene review, per glacier (owner).** For every year **three alternatives for every pick**, Sentinel-2 and Landsat, side by side with date, orbit, cloud and snow over the
   tongue, the bottom-3-km rule, Landsat 7 stripes, registration shift, a one-line reason for the ranking. The owner changes only what they disagree with. Landsat 7 stripe fill on
   every Landsat 7 year (skill `landsat-slc-gap-fill`; Landsat 5 only if a check shows a need: dropped lines, edge gaps), colour matching of all years (skill `landsat-colour-reference`),
   years that jump go to `LEAVE_OUT_YEARS` with the reason. Copernicus quota: spread over days.
3. **Data work (Claude, no input).** Source search and ledger (docs/DATA_SEARCH.md), oldest photograph, ice speed, photos/Street View/trails/peak names, yearly surfaces
   (docs/YEARLY_DEM_METHOD.md: anchors from dated surveys, model, validation against ICESat-2 / ASTER / stakes / radar), bed, lake, uncertainty, terrain bundle, SR pictures of every
   pinned year, provenance.
4. **QA (Claude, loops until clean).** `npm run check`, `npm test`, `python3 scripts/audit_glaciers.py`, terrain quality, validation numbers compared with Aletsch, a screenshot sweep of
   every layer and mode (map, compare, timelapse, 3D by year, science mode, bedrock, SR on/off, ice speed, three colour modes, Landsat years, phone width), `check_external_numbers.py`, board sync.
5. **Final look (owner).** The real page with Claude's findings written out per glacier; the owner confirms in the walkthrough. Notes become tasks.

## Why this order
Placement sets the strip; the strip sets terrain, cloud masks, centres, models and SR pictures. Scene pins set which picture is shown each year and what the SR step processes.
Both are owner judgements, so they come first, before any slow computation.
