---
name: landsat-slc-gap-fill
description: Use when Landsat 7 pictures (after 31 May 2003, scan-line-corrector stripes) of a glacier look wrong: bright or white fill patches, clouds copied into the stripes, pale streaks across the ice. Also for every glacier or region whose data/landsat has Landsat 7 years: how the gap fill works, how to rebuild, how to measure and check it.
---

# Landsat 7 stripe fill (`scripts/build_landsat.py`)

Works for any glacier or region the builder supports (`--outlet <id>`; Swiss and ice-cap records alike). Nothing here is Swiss-specific.

## What the builder does for a Landsat 7 year after 2003-05-31
1. `find_donor` picks up to 3 other scenes (not Landsat 7 after the SLC failure, whole picture, at most `DONOR_CLOUD = 0.25` cloud over glacier and tongue (the old gate, 10 % and 5 %, left cloudy-valley glaciers like the Gorner with no donor at all, so only flow interpolation; check `fills` in the json: empty means no donor was found), within 45 days of the season and 3 years), registered onto the Sentinel-2 mosaic.
2. `clear_donor` takes each donor's own **cloud** out of its valid mask: QA_PIXEL dilated-cloud flag, cloud at medium confidence or more, cirrus at medium or more, never on pixels flagged snow/ice, grown by 3 px. **Cloud shadow is not masked** (in the Alps that flag is mostly mountain shade, about a quarter of the picture).
3. `render` fills the stripes donor by donor (the first where it is clear, the next what is left). Each donor is matched to the base scene by quantiles over the whole picture (`render`) and then **locally** (`local_match`): per channel, by the mean (picture minus donor) over a 21 x 21 px window of pixels where both scenes are valid and not within 2 px of a stripe. The local step is what removes the pale streaks on grey ice: the global match is dominated by snow.
4. What no donor covers is interpolated along the ice streaks, then along rows/columns (the older flow fill).
The scene json gets `fill` (first donor) and `fills` (all donors).

## Done so far
Aletsch, Corbassière, Fiescher, Gorner, Zmutt rebuilt 2026-10-29 (Landsat 7 years only). Corbassière finds no donor (a narrow box, small stripes). Rhône, Trift, Unteraar have no Landsat 7 years. Faint hairlines remain along stripe edges on snow; base-scene cloud is not handled.

## Failure modes this fixed (Aletsch, 2026-10-29)
- Bright white patches on rock: the donor had small clouds exactly in the stripes although the scene counted as clear (8.7 % cloud overall). Cause: donor copied unmasked.
- Pale, colourless streaks across the tongue (about 13 to 15 levels of 255 too bright): donor ice from another day, global quantile map blind to ice.
- Not fixed by this: cloud in the **base** scene (Aletsch 2005, bottom edge); choose another scene or add it to `scripts/landsat-rejects.json`.

## Rebuild
1. List the Landsat 7 years: scenes in `data/landsat/<outlet>.json` with `sat == landsat-7` and `date >= 2003-05-31`.
2. Keep a copy of `data/landsat/<outlet>/` and the json first (they are git-ignored, nothing else holds them).
3. `python3 scripts/build_landsat.py --outlet <id> --years <those years>` (the other years in the json stay; cut-outs are cached in `scripts/.landsat-cache`, a first run needs the Planetary Computer).
4. Look at the pictures at full resolution, not only thumbnails.
5. Measure: in the tongue, compare the mean RGB of stripe pixels (base scene invalid) with ice 5 to 8 px away from a stripe; they should agree within a few levels and be equally coloured.
6. Raise `CDSE.version` (`js/03-imagery.js`) once per release of rebuilt pictures; upload with `scripts/upload_landsat.sh <bucket>` only when the owner agrees (it publishes); `python3 scripts/board_sync.py` and push the board afterwards (AGENTS.md, "Glacier checklist board").

## Tunables
`LOCAL_R = 10`, `EDGE_PX = 2` (`local_match`), `DONOR_CLOUD`, `grow=3` (`clear_donor`), donor count 3 (`find_donor`). Read the code before changing them; run the measurement of step 5 before and after.

## Scene picker previews (added 2026-11-02)
`build_landsat.py --outlet <id> --alternatives` makes the previews of the walkthrough's Landsat scene picker (`.cache/landsat-alts/`). They are drawn like the real build: Landsat 8 fixes (`fix_l8_blue`, `mark_l8_dark`), Landsat 7 stripes and edge gaps filled from donor scenes (`find_donor` + `render`), colours matched. Done on 2026-11-02 for the Swiss glaciers whose Landsat scenes were not yet fixed (Unteraar, Corbassiere, Zmutt, Findel, Fee, Trift); Rhone, Aletsch, Fiescher and Gorner already had fixed scenes (owner). **To do for every other glacier or region:** run the same command with `--outlet <id>` (`--years 1986 ...` adds or replaces only those years in the list), look at previews with stripes or Landsat 8 colour problems before the owner picks. 1986 is no longer left out for the ten Swiss glaciers (`LEAVE_OUT_YEARS_OPEN`); other outlets still skip it (`LEAVE_OUT_YEARS`), the reason for that old rule is not documented: look at it again per region.
