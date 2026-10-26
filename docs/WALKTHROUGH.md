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

## What is not done yet

- **From confirmed records to the site's data files** (an exporter to `data/boxes.js`, `data/scenes.json`, the region record and the region data file) and **from the site's existing data to proposals** (an importer, so the ten Swiss glaciers and the Icelandic, Norwegian and Svalbard outlets are confirmed, not typed in again). Until then the walkthrough produces records that the site does not read.
- **"Real page" tab** (v2 showed its own app drawn from the draft): it needs the exporter. Removed from the screens for now.
- Phases 2 to 4, rendering the Landsat pictures from raw bands (the wizard scans and fills stripes; `scripts/build_landsat.py` still renders), the outline download for a region without GLAMOS.
- The older tools stay until the exporter lands: `scripts/tools/onboard.html`, `box-editor.html`, `view3d-editor.html`, `pick-scenes.html`.

## What changed from v2

- The wizard is bundled by esbuild in a plain Node server (`walkthrough/server.ts`), not a Vite plugin; colours and the typeface are the site's `css/tokens.css`.
- The relay it uses (`walkthrough/relay/`, by meaning: a glacier, a year, a date) runs only here with a file cache. The public Worker (`worker/worker.js`) still relays raw requests; moving it to this design is a later step.
- The "Real page" tab and v2's own app (Explorer, landing page, gallery) are not ported: this repo already has them.
- `providers.json` (which services are asked for each map layer) lives in `walkthrough/`.
