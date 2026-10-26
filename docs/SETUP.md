# Setup and operations

Moved here from the README, unchanged: publishing a copy, optional Street View and gallery, and adapting the project to another region.

## Publish your own copy

1. **Cloudflare:** fork the repository; under *Settings → Secrets and variables → Actions* set the secrets `CLOUDFLARE_API_TOKEN` (Workers edit rights) and `CLOUDFLARE_ACCOUNT_ID` and the variables `CF_KV_CACHE_ID` and `CF_R2_GALLERY_BUCKET`, then run the workflow *Build data and deploy*. One Worker serves the site and the relay (`worker/wrangler.toml`).
2. **Relay (free):** create a Cloudflare Worker from `worker/worker.js`; add your OAuth client as the secrets `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`, a text variable `ALLOWED_ORIGINS` (your site address, plus `http://localhost:8000` for development), and optionally a KV namespace bound as `CACHE`. Check `…/cdse/ping`.
3. **Connect:** in the GitHub repository add the variable `CDSE_RELAY_URL` (the Worker address) and run the workflow again. Optionally run `scripts/tools/warm-up.html` locally afterwards to fill the relay cache.

For a strict limit against misuse, add a Cloudflare rate-limiting rule for the path `/cdse/`. Please check that the [Copernicus terms](https://dataspace.copernicus.eu) allow serving a public website from one account before you launch.

## Street View panoramas (optional)

The map layer *Street View* shows seven panoramas of the Aletsch Glacier (`data/streetview.json`) in Google's own viewer. It needs a public **Maps Embed API** key (the API is free and unlimited):

1. In the [Google Cloud console](https://console.cloud.google.com) create a project with billing enabled, and enable **Maps Embed API**.
2. Create an API key, restrict it to the website addresses `https://<your site>/*` and `http://localhost:8000/*`, and to the API *Maps Embed API* only.
3. Add the key as the repository variable `STREETVIEW_EMBED_KEY` and run the workflow again. Locally, add `streetViewKey: "…"` to `config.js`. Without the key the layer is not offered.

To choose other panoramas, put a separate key (restricted to your IP address and to *Street View Static API*; its metadata requests are free) in `scripts/.google-key` and run `python3 scripts/build_streetview.py scan`, then `rank --visitors`, then `review` (see the docstring). Google forbids storing Street View content except panorama ids, so the scan results stay local (git-ignored).

## Gallery (optional)

Visitors can share a finished picture or animation (button *Share it in the gallery* after a download). Uploads wait in a queue until you approve them; `gallery.html` shows only approved items, filterable by glacier, year, type and band combination.

Set up in Cloudflare (the Worker needs to be pasted again afterwards):
1. **R2:** create a bucket, bind it to the Worker as `GALLERY`. Add a lifecycle rule on the prefix `pending/` that deletes objects after 14 days.
2. **Turnstile:** create a widget for your site's domain. Add the secret key as Worker secret `TURNSTILE_SECRET` and the site key as text variable `TURNSTILE_SITEKEY`.
3. **Admin token:** add a Worker secret `GALLERY_ADMIN_TOKEN` (at least 20 random characters).
4. **Rate limit:** add a Cloudflare rate-limiting rule for `/gallery/submit` (for example 5 requests per hour per IP).
5. **Moderate:** run `python3 -m http.server 8000` and open `http://localhost:8000/scripts/tools/gallery-admin.html`, enter the token, approve or reject.

What the Worker enforces on every upload: Turnstile check; at most 15 MB (video) or 4 MB (picture); the real file type (JPEG or H.264 MP4) and the exact pixel size of the three export formats; a fixed list of details (glacier, years, type, format, colours, optional nickname); at most 200 items waiting; one copy of each file; 4 uploads per hour per address (per Worker instance). Pending files are never served. Approved files are served with `nosniff` and a sandboxing content-security-policy. The page shows all text via `textContent`.

## Make your own version for another region

The imagery part works anywhere Sentinel-2 does. The Swiss parts are the data sources and a few limits. To adapt it:

1. **Pick your glaciers and a national or regional inventory.** Everything Swiss is in a few places, so start with these files: `build_outlines.py`, the 3D scripts (swissALTI3D, swissNAMES3D, swissTLM3D; use your national elevation model, or drop the 3D view and trails) and the swisstopo layers in `index.html`. Replace the GLAMOS downloads in `scripts/build_outlines.py` with your inventory (outlines and areas), and with a length-change series if one exists for your region. Many countries publish inventories; the global Randolph Glacier Inventory and GLIMS are alternatives.
2. **Area limits:** in `worker/worker.js` change the bounding box `SWISS` to your region. In `index.html` update `SWISS_VIEW`, the built-in glacier list `DEFAULTS` and the `GLACIER_INFO` texts. Only write facts you can source.
3. **Season:** the page looks for the clearest scene between 1 July and 20 September (`CDSE.months`, `LAST_DAY`). In the southern hemisphere or the tropics choose the end of your melt season instead, and change the matching date checks in the Worker.
4. **National figures:** the Switzerland tab uses yearly ice loss and total ice volume from GLAMOS and SCNAT (`VOLUME_LOSS`, `ICE_2024`). Replace them with your own source or remove the tab.
5. **Regenerate the data files:** run `make_cloud_masks.py`, pick scenes with `scripts/tools/pick-scenes.html` (optional) and, for 3D, the three terrain scripts.
6. **Texts and credits:** the About chapter, sources list and credits line must list your data.

Open an issue if you get stuck. I would be glad to hear about a dashboard for another region and to link to it.
