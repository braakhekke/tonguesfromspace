# Setup and operations

Publishing a copy, optional Street View and gallery, and adapting the project to another region. Checked against the workflows, `worker/wrangler.toml` and `worker/worker.js` on 2026-11-09.

## Publish your own copy

The site is one Cloudflare Worker with static assets: `worker/wrangler.toml` names `main.ts` (the relay under `/api/`, and everything else to `worker.js`: the Copernicus relay, the gallery, the Landsat files) and serves the built site from `_site`. The workflow *Build data and deploy* (`.github/workflows/deploy.yml`) builds, tests and deploys it; nothing is pasted into the Cloudflare dashboard.

1. **Cloudflare resources.** Create a KV namespace (the image cache) and two R2 buckets (the gallery, and the Landsat pictures). In your fork under *Settings → Secrets and variables → Actions* set the **secrets** `CLOUDFLARE_API_TOKEN` (Workers edit rights) and `CLOUDFLARE_ACCOUNT_ID`, and the **variables** `CF_KV_CACHE_ID`, `CF_R2_GALLERY_BUCKET` and `CF_R2_LANDSAT_BUCKET`. The deploy stops with a message if one of the three variables is missing.
2. **Your address.** In `worker/wrangler.toml` change `ALLOWED_ORIGINS` (the origins the relay accepts; keep `http://localhost:8000` for development). Set the repository variable `CDSE_RELAY_URL` to the site's own address, for example `https://example.org/` (the Worker serves site and relay). `worker/worker.js` still names the owner's domain as the fallback when `ALLOWED_ORIGINS` is not set (`allowed`) and in its `User-Agent` (`WD_UA`): change both.
3. **Copernicus.** Create an OAuth client in the [CDSE dashboard](https://shapps.dataspace.copernicus.eu/dashboard/) (*User settings → OAuth clients*) and add it to the Worker as the secrets `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` (`npx wrangler secret put …` in `worker/`, or the dashboard). Further accounts can be added as `CDSE_CLIENT_ID_2` / `CDSE_CLIENT_SECRET_2` up to `_15`; the Worker uses the next one when the first has no processing units left. `keep_vars = true` keeps variables set in the dashboard.
4. **Run the workflow** (push to `main`, or run it by hand). It also runs on the 1st of every month, to rebuild the data files. Check `https://<your site>/cdse/ping`: `{"relay":true,"managed":true}`.

**Optional repository variables** (all empty = off): `STREETVIEW_EMBED_KEY` (below); `CF_WEB_ANALYTICS_TOKEN` (Cloudflare Web Analytics site token, cookieless page views; empty = no beacon); `PUBLISH_ICELAND=1` (Iceland on the public site: menu entry, `/iceland/` addresses, sitemap line), `PUBLISH_NORWAY=1` (the same for Norway and Svalbard) and `PUBLISH_LANDSAT=1` (the Landsat switch, years before 2016; the pictures live in the R2 bucket and are uploaded with `scripts/upload_landsat.sh <bucket>`). Without them the public site is Switzerland only.

For a strict limit against misuse, add a Cloudflare rate-limiting rule for the path `/cdse/`. Please check that the [Copernicus terms](https://dataspace.copernicus.eu) allow serving a public website from one account before you launch.

**Locally** (no Cloudflare needed): `npm ci`, then `python3 scripts/serve.py` (asks for the Copernicus client ID and secret, or reads `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` or `scripts/.cdse-credentials`), and open http://localhost:8000. `serve.py` has no gallery.

## Street View panoramas (optional)

The map layer *Street View* shows seven panoramas of the Aletsch Glacier (`data/streetview.json`) in Google's own viewer. It needs a public **Maps Embed API** key (the API is free and unlimited):

1. In the [Google Cloud console](https://console.cloud.google.com) create a project with billing enabled, and enable **Maps Embed API**.
2. Create an API key, restrict it to the website addresses `https://<your site>/*` and `http://localhost:8000/*`, and to the API *Maps Embed API* only.
3. Add the key as the repository variable `STREETVIEW_EMBED_KEY` and run the workflow again. Locally, add `streetViewKey: "…"` to `config.js`. Without the key the layer is not offered.

To choose other panoramas, put a separate key (restricted to your IP address and to *Street View Static API*; its metadata requests are free) in `scripts/.google-key` and run `python3 scripts/build_streetview.py scan`, then `rank --visitors`, then `review` (see the docstring). Google forbids storing Street View content except panorama ids, so the scan results stay local (git-ignored).

## Gallery (optional)

Visitors can share a finished picture or animation (button *Share it in the gallery* after a download). Uploads wait in a queue until you approve them; `gallery.html` shows only approved items, filterable by glacier, year, type and band combination.

Set up in Cloudflare:
1. **R2:** the bucket named in `CF_R2_GALLERY_BUCKET` is bound to the Worker as `GALLERY` by `wrangler.toml`. Add a lifecycle rule on the prefix `pending/` that deletes objects after 14 days.
2. **Turnstile:** create a widget for your site's domain. Add the secret key as Worker secret `TURNSTILE_SECRET` and the site key as text variable `TURNSTILE_SITEKEY` (kept by `keep_vars`).
3. **Admin token:** add a Worker secret `GALLERY_ADMIN_TOKEN` (at least 20 random characters).
4. **Rate limit:** add a Cloudflare rate-limiting rule for `/gallery/submit` (for example 5 requests per hour per IP).
5. **Moderate:** the Worker has a moderation API under `/gallery/admin/`, sent with the header `Authorization: Bearer <token>` and an `Origin` from `ALLOWED_ORIGINS`: `GET /gallery/admin/pending` lists the queue, `GET /gallery/admin/file/pending/<id>` shows a file, and `POST /gallery/admin/approve`, `/reject` or `/remove` with the JSON body `{"id": "<id>"}` approves, rejects or removes an item. The owner's moderation page, `scripts/tools/gallery-admin.html`, is a local tool that is not in this repository.

What the Worker enforces on every upload: Turnstile check; at most 15 MB (video) or 4 MB (picture); the real file type (JPEG or H.264 MP4) and the exact pixel size of the three export formats; a fixed list of details (glacier, years, type, format, colours, optional nickname); at most 200 items waiting; one copy of each file; 4 uploads per hour per address (per Worker instance). Pending files are never served. Approved files are served with `nosniff` and a sandboxing content-security-policy. The page shows all text via `textContent`.

## Make your own version for another region

The imagery part works anywhere Sentinel-2 does. A region is data: nothing in the code tests a region's id, differences are `features` flags. To add one:

1. **The region record.** Add an entry to `REGIONS_ALL` in `js/regions.js` (data file, texts, credits, `picker` for the front page, `path` for its address) and its logic switches in `js/00-regions.js` (`features`, `season`). Use the entries of Switzerland (`ch`, an inventory with length and volume change) and of Iceland, Norway and Svalbard (`rgi: true`, ice caps and outlets drawn by `renderStoryIcecap`) as templates.
2. **Glaciers and outlines.** Switzerland's data file comes from `scripts/build_outlines.py` (GLAMOS downloads); the other regions' from `scripts/build_regions.py` (RGI, national inventories) with `scripts/icecap_lib.py`. Use your national or regional inventory where there is one. A new glacier needs only documented facts with a source.
3. **Picture box, tongue tip and 3D strip.** The page reads them from `data/boxes.js`, one record per glacier (`box`, `tip`, `strip3d`). In the owner's setup that file is generated from records that are kept locally and are not in this repository; in a copy, write the records by hand in the same format (`tests/test_boxes.py` checks that file, page and data files agree). Every picture's cache key contains the exact box, so change it before you fetch pictures.
4. **The Worker.** The relay accepts a request only if its picture box lies near a centre listed in the Worker. `python3 scripts/sync_worker_centres.py` writes `CENTRES` in `worker/worker.js` from the data files named in its `FILES` table (add your region there; Switzerland is the box `SWISS` instead). The scene seasons the Worker allows are `SEASONS` in the same file, edited by hand, and must match the region's `season` in `js/regions.js` (Switzerland: 1 July to 20 September). Choose the end of your melt season (southern hemisphere, tropics). The Worker deploys with the next push.
5. **3D terrain and clouds.** `python3 scripts/build_terrain.py <id>` bakes the terrain file of a glacier (Swiss glaciers from swissALTI3D with `build_terrain_bundle.py`, other regions from ArcticDEM or the Mapterhorn tiles); `python3 scripts/make_cloud_masks.py` makes the areas for "Latest". Pin a scene by hand in `data/scenes.json` where the automatic pick is wrong.
6. **Texts and credits.** The About chapters, the `SOURCES` list in `js/07-render.js`, the credits line and `docs/SOURCES.md` must list your data. Only write facts you can source.

Open an issue if you get stuck. I would be glad to hear about an explorer for another region and to link to it.
