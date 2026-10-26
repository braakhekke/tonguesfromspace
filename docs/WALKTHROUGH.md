# The walkthrough: adding a region or a glacier

One ordered, resumable walk from "a region" to "published", on your own computer. Ported from the v2 rewrite (2026-10-26) and kept as it was designed; what was changed is listed at the end.

```bash
npm ci
npm run walkthrough:serve         # http://localhost:5174/onboard   (the wizard)
npm run walkthrough -- status     # the same engine on the command line: where everything stands, what is next
npm run walkthrough -- new-region iceland Iceland 64.9 -18.5
npm run walkthrough -- new-glacier iceland breidamerkurjokull "Breiðamerkurjökull" 64.1 -16.3
```

Scene scans and the satellite pictures in the Real page need Copernicus credentials: run `npm run credentials` in a terminal (the secret is typed hidden, checked with a real login, and saved to the git-ignored `.dev.vars`; `-- --account 2` adds a failover account), or put `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` in the environment. Everything else works without.

## How it works

- **Steps are data** (`walkthrough/steps.ts`): each says what it produces, what it needs, what to look at, and its automatic checks. Phase 1 is built: region and unit rule, the glacier record, outline, tongue tip and picture box, balance year and scene rule, scene review, map layers. Phases 2 to 4 (3D view, content, About and Sources) are listed as "not built yet".
- **Status is derived, never stored** (`engine.ts`): done, to do, proposed, stale, blocked. A confirmation stores who, when, why and a hash of the step's outputs and of everything upstream (`basedOn`), so changing the picture box makes the season, the scene review and the layers stale by itself.
- **Tools propose, people confirm.** What a tool finds (GLAMOS outlines, Landsat scans, layer probes) is a proposal in `.cache/proposals` and becomes data only when you confirm it with a reason.
- **One data contract** (`walkthrough/shared/schema.ts`, zod): a region never supplies defaults to its glaciers; every value that differs between glaciers is decided, written into the glacier's own record and confirmed. Scenes belong to the balance year they close (`shared/season.ts`, tested at the boundaries).
- **The records** are `data/regions/<region>/region.json` and `<glacier>/{glacier,outlines,scenes}.json`. `npm run walkthrough -- status` validates all of them.
- **Placement first** (see CLAUDE.md): the box, tip and 3D strip are confirmed before anything else is built on them.
- The local server accepts only `localhost` calls, refuses cross-site requests and needs a custom header for writes (`server.ts`, tested).

## Starting from a chat request

```bash
npm run onboard -- new-zealand "Tasman Glacier" "Franz Josef@-43.4678,170.1883" --region-name "New Zealand"
```

**Minimum and maximum size (the same in every region):** at most 26 glaciers per region, the largest by inventory area (`MAX_PER_REGION`, `shared/geo.ts`); outlets of an ice cap count as glaciers. **Minimum size:** a glacier known to be under 10 km² (`MIN_ONBOARD_KM2`, `shared/geo.ts`; the inventory's own area) is not onboarded: `onboard`, `onboard-paul` and `propose-glamos` leave it out and say so.

One command does what a request in chat means: it makes the region and the glaciers (drafts), looks up the outlines, writes every proposal that can be written, probes the map layers, starts the walkthrough server in the background (log: `.cache/walkthrough.log`) and opens it in a **new browser window** on the first step that needs a person (`--no-open` only prints the link). What it fills in, all as proposals and nothing confirmed:

| Step | Proposal | From |
|---|---|---|
| Region | the sources found, with licences marked NOT READ; the unit rule is a placeholder that cannot be confirmed | the outline sources |
| The glacier | id (the address), name, inventory id, rank among the group by area, area, centre | RGI 6.0 record, as the inventory states it |
| Outline | the RGI 6.0 outline (about 2000), neighbours to add parts from, and the oldest dated GLIMS outline of the same glacier when it is clearly older | GLIMS public service (`sources/glims.ts`) |
| Tip and box | the outline plus 15 %; the tip is the southernmost point, a first guess that says so | the outline |
| Balance year and scene rule | copied from the closest glacier already set up, and said so | the records |
| Map layers | what each provider has over the box, with the licence read from its page | `providers.json` |

A name GLIMS does not know, or knows twice, needs coordinates: `"name@lat,lon"`. RGI 6.0 is the one outline source that answers anywhere; where a national inventory exists it is better (`walkthrough/outline-sources.json` lists what is known and how each is fetched: GLAMOS for Switzerland automatically, the Icelandic, Norwegian and Svalbard inventories through the site's build scripts). RGI 7 is newer but its files need an Earthdata login (HTTP 401 without one, checked 26 Oct 2026). Sources found on the web are added with `npm run walkthrough -- add-source <region> <id> "<name>" <url>`. Not filled in, because it cannot be known without a person or credentials: licences, the unit rule, where the balance-year dates come from, the lowest point of the ice front, the scene review (scans run in the wizard and need Copernicus credentials), the 3D strip and camera, the elevation model that covers the strip.

**Baked 3D terrain (every region the same):** the Elevation model step has a *Build the terrain file* button (`walkthrough/terrain-build.ts`: exports the records, then `scripts/build_terrain.py <id>`). It needs the confirmed 3D strip; the screen shows the file, its peak names with their source and whether it holds the record's strip (stale = build again). The board's *Elevation models* and *Peak names* checks are the safety net.

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

## Names for the front page's search

`npm run walkthrough -- aliases` writes `data/glacier-aliases.js`: for every glacier the labels and aliases of its Wikidata item in every language (Wikidata's data is CC0, from its own licensing page), so the search on the front page (`js/search.js`) finds a glacier by its name in any language. An item counts only when it is a glacier (a subclass of Q35666) near the glacier's centre **and** one of its names says the glacier's name (the glacier itself before its firn or neighbour); a glacier with no such item (three of 52 today: Sylgjujökull, Jostedalsbreen, Storisstraumen) is still found by the name the site has. Run it by hand when glaciers are added and commit the file. The search folds accents (ð d, þ th, ß ss ...), ignores the word for "glacier" in many languages, forgives a wrong, missing, extra or swapped letter, finds half-typed names and two words written as one, and offers "Did you mean…" when it is unsure. Only glaciers of open regions are offered.

## Names of the neighbouring glaciers (the layer "Glacier names")

`npm run walkthrough -- names` writes `data/glacier-names.js`: for every glacier, the glaciers whose position lies inside its picture box, with their names. Wikidata (CC0) is the main source (a name in the language of the place first: German, French, Italian ... for Switzerland, Icelandic, Norwegian), the Randolph Glacier Inventory 6.0 via GLIMS fills in names Wikidata lacks nearby; the glacier itself carries the name the site uses and is drawn larger. The dashboard's layer menu has a row "Glacier names" (off at first, remembered); labels that would overlap are hidden, so zooming in shows more. Map only: the 3D view does not draw them. Run by hand when glaciers or boxes change and commit the file.

## Phases

| Phase | Steps | State |
|---|---|---|
| 1 Map view | region and unit rule, the glacier, outline, tongue tip and picture box, balance year and scene rule, scene review, map layers | built |
| 2 3D view | 3D strip and start camera (drag the far end, the side and the near handle, or type the numbers; the camera is read from the real 3D view in the Real page tab), then the elevation model, which has to cover the strip (a changed strip makes it stale) | built |
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
- A glacier carries `dataKey` (its key in the site's data files), `imported`, `parent` (an outlet of an ice cap is a glacier of its own, id `<cap>-<name>`, ranked within its cap; one only proposed from `scripts/tools/sub-boxes-<cap>.json` stays off the site until its placement is confirmed), and `strip3d.cell` / `strip3d.cam`.
- v2's own app (Explorer, landing page, gallery) is not ported: this repo has them. The Real page tab shows this site's dashboard.
- Shared code lives at the repo level (`shared/`: schema, season rule, geometry, Copernicus request builder), because the Worker, the walkthrough and their tests all use it.
- `providers.json` (which services are asked for each map layer) lives in `walkthrough/`.
