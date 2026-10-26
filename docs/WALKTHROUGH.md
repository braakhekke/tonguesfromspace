# The walkthrough: adding a region or a glacier

One ordered, resumable walk from "a region" to "published", on your own computer. Ported from the v2 rewrite (2026-10-26) and kept as it was designed; what was changed is listed at the end.

```bash
npm ci
npm run walkthrough:serve         # http://localhost:5174/onboard   (the wizard)
npm run walkthrough -- status     # the same engine on the command line: where everything stands, what is next
npm run walkthrough -- new-region iceland Iceland 64.9 -18.5
npm run walkthrough -- new-glacier iceland breidamerkurjokull "Breiðamerkurjökull" 64.1 -16.3
```

Scene scans need Copernicus credentials in `.dev.vars` (`CDSE_CLIENT_ID=...`, `CDSE_CLIENT_SECRET=...`; git-ignored) or in the environment. Everything else works without.

## How it works

- **Steps are data** (`walkthrough/steps.ts`): each says what it produces, what it needs, what to look at, and its automatic checks. Phase 1 is built: region and unit rule, the glacier record, outline, tongue tip and picture box, balance year and scene rule, scene review, map layers. Phases 2 to 4 (3D view, content, About and Sources) are listed as "not built yet".
- **Status is derived, never stored** (`engine.ts`): done, to do, proposed, stale, blocked. A confirmation stores who, when, why and a hash of the step's outputs and of everything upstream (`basedOn`), so changing the picture box makes the season, the scene review and the layers stale by itself.
- **Tools propose, people confirm.** What a tool finds (GLAMOS outlines, Landsat scans, layer probes) is a proposal in `.cache/proposals` and becomes data only when you confirm it with a reason.
- **One data contract** (`walkthrough/shared/schema.ts`, zod): a region never supplies defaults to its glaciers; every value that differs between glaciers is decided, written into the glacier's own record and confirmed. Scenes belong to the balance year they close (`shared/season.ts`, tested at the boundaries).
- **The records** are `data/regions/<region>/region.json` and `<glacier>/{glacier,outlines,scenes}.json`. `npm run walkthrough -- status` validates all of them.
- **Placement first** (see CLAUDE.md): the box, tip and 3D strip are confirmed before anything else is built on them.
- The local server accepts only `localhost` calls, refuses cross-site requests and needs a custom header for writes (`server.ts`, tested).

## The records are the source of truth

`data/regions/<region>/...` holds what has been decided about each region and glacier; three files of the site are **generated** from it and must not be edited by hand:

| Generated file | From | What it is |
|---|---|---|
| `data/boxes.js` | the placement of each glacier (tip, picture box, 3D strip, start camera, sub-outlets) | what every picture, strip and Worker centre is cut from |
| `data/scenes.json` | the Sentinel-2 scenes a person pinned or approved | the picks the page uses instead of its automatic choice |
| `worker/glacier-index.json` | placement and season of each glacier | what the relay may be asked for |

```bash
npm run walkthrough -- export            # write them
npm run walkthrough -- export --check    # fail if they differ from the records (npm run check and CI run this)
npm run walkthrough -- import-site       # fill the records from the site's current data
```

- **Importing** reads the site's own data (`js/regions.js`, `data/boxes.js`, `data/scenes.json`, `data/landsat/`, the region data files) and writes records marked `imported`, **with no confirmation**: the walkthrough shows every step as "proposed" until a person has looked at it and confirmed it with a reason. Outlines are not copied (the build scripts make them from the inventories): a record points at them. Where the site's rule cannot be said in the walkthrough's terms (a target day, a window that ends before the balance year) the difference is written into the rule's note. A record a person confirmed is never overwritten.
- **Exporting** publishes imported records as they are, so nothing changes for visitors while the confirming goes on. A test imports the real site data, exports it again and requires `boxes.js` (including the derived picture sizes by the page's own rounding rule), `scenes.json` and the index to be what they were.
- **The real page tab** shows the actual dashboard (`/site/` of the walkthrough server) drawn from the records plus what is in the form right now, confirmed or not. Nothing is saved until you confirm.

## Phases

| Phase | Steps | State |
|---|---|---|
| 1 Map view | region and unit rule, the glacier, outline, tongue tip and picture box, balance year and scene rule, scene review, map layers | built |
| 2 3D view | elevation model, 3D strip and start camera (drag the far end, the side and the near handle, or type the numbers; the camera is read from the real 3D view in the Real page tab) | built |
| 3 Content | Discover texts, facts, Stats, each fact with its source | listed, not built |
| 4 About and Sources | generated from what phases 1 to 3 enabled | listed, not built |

## The relay by meaning (Worker)

`worker/main.ts` is the Worker's entry: `/api/*` goes to `worker/relay/` (a glacier, a date, a colour style and a tile; the request to Copernicus is built from the glacier's record in `worker/glacier-index.json`, so there is no request body to validate and an unknown glacier cannot be asked for), everything else to `worker/worker.js` as it was (the raw relay under `/cdse/`, the gallery, the Landsat pictures). The page still uses `/cdse/`; moving it to `/api/` is the next step, and what the page asks that the relay cannot yet answer by meaning (the 3D strip pictures, the whole-ice-cap tiles, Latest over the tongue circle) has to be added to the relay first. The walkthrough runs the same relay locally with a file cache.

## What is not done yet

- Phases 3 and 4.
- The page does not call `/api/` yet (see above); the old `/cdse/` route stays until it does.
- The older tools still exist: `scripts/tools/onboard.html`, `box-editor.html`, `view3d-editor.html`, `pick-scenes.html`. The walkthrough covers what they did (box, strip and camera, scene choice); retire them when you have used it on a real glacier.
- Rendering Landsat pictures from raw bands (the wizard scans and fills stripes; `scripts/build_landsat.py` still renders), the outline download for a region without GLAMOS, the quick "confirm all imported" for a whole region (confirm glacier by glacier, so each is looked at).

## What changed from v2

- The wizard is bundled by esbuild in a plain Node server (`walkthrough/server.ts`), not a Vite plugin; colours and the typeface are the site's `css/tokens.css`.
- Outlines may be references into the site's data files, and lines (the Icelandic Met Office outlines are open lines), besides polygons.
- A glacier carries `dataKey` (its key in the site's data files), `imported`, sub-outlets in its placement, and `strip3d.cell` / `strip3d.cam`.
- v2's own app (Explorer, landing page, gallery) is not ported: this repo has them. The Real page tab shows this site's dashboard.
- Shared code lives at the repo level (`shared/`: schema, season rule, geometry, Copernicus request builder), because the Worker, the walkthrough and their tests all use it.
- `providers.json` (which services are asked for each map layer) lives in `walkthrough/`.
