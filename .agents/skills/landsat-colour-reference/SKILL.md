---
name: landsat-colour-reference
description: How Landsat pictures of a glacier are colour-matched to each other (ice-free LAND patch, QUANT levels, median calibration over the years, Landsat 8 quantile map, donor matching) in scripts/build_landsat.py, and how to check or redo it for any glacier or region. Use when Landsat years of one glacier differ in tone, when onboarding Landsat for a new glacier, or when adding a colour style.
---

# Landsat colour reference (scripts/build_landsat.py)

Goal: every year of one glacier looks like the same place under the same light, so a timelapse does not flicker. It is a per-glacier matching, never a global one, and it only touches the **ice-free ground**; ice and snow are left as measured.

## The method
1. **Surface reflectance.** Collection 2 Level-2 DN to reflectance: `DN * 0.0000275 - 0.2`. Six bands are cut per scene (`ASSETS`: red, green, blue, nir08, swir16, swir22 = planes 0 to 5, valid mask plane 6 = `MASK`). Nearest-neighbour: the pixels stay 30 m Landsat pixels.
2. **LAND patch.** A patch of ice-free rock/gravel, as shares of the picture (west, north, east, south). Per glacier: `auto_land(rings, bounds, zdem)` (size 0.2, min height 30; second try size 0.1, min height 5 for calving glaciers); Breidamerkurjokull has a hand-set one. No ice-free land at all: `NOMATCH = True`, plain surface reflectance, years are not matched (the build says so).
3. **Levels.** `land_levels`: per band the `QUANT = (0.15, 0.70)` quantiles of the LAND patch (valid pixels only).
4. **Reference `cal`.** In `main()`: the median, over every year's Landsat 5/7 scene (Landsat 8 is not part of it, also years not asked for), of those two levels, per band.
5. **Gain and offset per band** (`paint`): `refl = cal0 + (r - lev0) * (cal1 - cal0) / (lev1 - lev0)`, floored at 0. Then the same colour curve as the Sentinel-2 true-colour pictures (`sadj`, no Rayleigh term: surface reflectance), saturation `TC['sat']`, sRGB.
6. **Landsat 8** (OLI, LaSRC correction: rock comes out too yellow, blue too low, a gain/offset cannot fix it): `qmap_for` maps 12 quantiles of the whole picture (`GQ`) to the median of those of the Landsat 5/7 years (`GQ_REF`), piecewise linear, slope 1 beyond the ends (`qapply`). Left out in Iceland and Svalbard (`EXCLUDE`): too over-corrected over ice, shade and water.
7. **Donor scenes** (Landsat 7 stripes, see skill `landsat-slc-gap-fill`): each donor is painted with its *own* gain/offset, then mapped per channel by 64 quantiles onto the base scene over the pixels where both are valid, then `local_match`.
8. Positions are separate: every scene is registered onto the Sentinel-2 cloudless mosaic (`register`, `shiftM` in the json).

## Checking and redoing
- Rebuild one glacier: `python3 scripts/build_landsat.py --outlet <id> [--years ...]` (cache `scripts/.landsat-cache`, 22 GB, git-ignored; network only for uncached scenes). It rewrites all pictures of the glacier and `data/landsat/<id>.json`.
- Look at the rock: an ice-free patch must have the same tone in every year. Compare years side by side (`scripts/landsat_overview.py`).
- If one year stays off: its LAND patch may hold cloud/shadow/snow (pick another patch or reject the scene in `scripts/landsat-rejects.json`), or it is Landsat 8.
- A new style (colour composition) must be painted from the *matched* reflectance (see `paint`), never from DNs, so the years stay alike.

## Adding a style to existing pictures (`--styles`)
`python3 scripts/build_landsat.py --outlet <id> --styles false3 [--years ...]` paints only that style (`restyle`) for the scenes, shifts (`shiftM`) and donor scenes already in `data/landsat/<id>.json`, with the same colour reference and stripe fill; the other pictures and the scene entries are not touched, and the style is added to the json's `styles` (the page offers a style for a Landsat year only when the json lists it, else that year stays natural). Cache makes it local (about 40 s a year, Landsat 7 stripe years with donors take longer). Style `false3` is "Hot?": red = red / SWIR1 (0 to 2), green = blue (0 to 0.4), blue = SWIR1 (0 to 0.35, gamma 1/2.2), from the matched reflectance (`paint`, `HOT`); same recipe as `hotEvalscript` in `js/03-imagery.js` and `shared/copernicus.ts` for Sentinel-2. The flow direction of the stripe fill reads the current guide, so interpolated pixels (where no donor covers) can differ a little from the other styles. New pictures reach the site only through `scripts/upload_landsat.sh` (R2).

## Rules
Never match on ice; never match years of different glaciers to each other; keep the Landsat 8 quantile map out of Iceland; say in the report when `NOMATCH` is on.
