# Swiss Glacier Tongues from Space

Compare and animate Sentinel-2 satellite images of the tongues of the ten largest Swiss glaciers, from 2016 to the latest available year, next to glacier figures from Glacier Monitoring Switzerland (GLAMOS).

Created by J. Braakhekke for public glacier awareness. See also [For Your Ice](https://foryourice.org/).

**Live site:** https://braakhekke.github.io/tonguesfromspace/

## What it does

- **Compare:** swipe between two years of satellite imagery.
- **Timelapse:** play a range of years as an animation.
- **Outlines:** show the glacier outline of about 1850 and of the newest inventory (SGI2023).
- **Measure:** draw lines and areas; lengths and areas are geodesic.
- **Key figures:** area (about 1850, 1973, 2023) and tongue length change, all from GLAMOS.
- **Swiss context:** share of the national ice volume lost each year since 2016.

## Repository layout

```
index.html                     the dashboard (a single page, no build step)
glaciers.js                    GLAMOS data, created and updated automatically by the workflow
config.js                      written by the workflow on publish: address of the Copernicus relay
scripts/build_outlines.py      downloads GLAMOS inventories + length changes, writes glaciers.js
scripts/serve.py               local server + Copernicus login relay (for running on your own computer)
worker/worker.js               Cloudflare Worker: Copernicus relay for the public site
worker/wrangler.toml           optional, for deploying the Worker from the command line
.github/workflows/deploy.yml   builds glaciers.js and publishes the site on GitHub Pages
```

## Publishing on GitHub Pages (one time)

1. Upload all files to the repository, including the hidden `.github` folder (see below).
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, choose **Build data and deploy** and click **Run workflow**.

The workflow downloads the GLAMOS data, commits `glaciers.js`, and publishes the site. After that it runs by itself on every push to `main` and on the 1st of every month, so new GLAMOS releases are picked up automatically. New EOX imagery years appear in the dashboard by themselves.

**Uploading through the GitHub website:** on a Mac, folders starting with a dot are hidden in Finder. Press **Cmd + Shift + .** in Finder to show them before dragging the folder contents into **Add file → Upload files**. If `.github` does not come along, create the file `.github/workflows/deploy.yml` in GitHub with **Add file → Create new file** and paste its content.

## Imagery sources

| Source | Account | Years | Use |
|---|---|---|---|
| EOxCloudless annual mosaics (default) | none | 2016 onwards, as published by EOX | 2016 CC BY 4.0; later years CC BY-NC-SA 4.0 (non-commercial) |
| Copernicus Sentinel-2 quarterly mosaics, July–September | free CDSE account | every year from 2016 | free for any use, with attribution |

The Copernicus mosaics need a login relay, because browsers block the Copernicus login when a web page calls it directly. GitHub Pages only serves files, so the public site uses a small Cloudflare Worker for this (next section). Without it, the Copernicus option is switched off on the public site and explains why.

## Copernicus mosaics on the public site (Cloudflare Worker, free)

The Worker logs in to Copernicus with **your** CDSE credentials, which are stored as encrypted Cloudflare secrets, and caches every image, so each glacier-year image is fetched from Copernicus only once. Visitors need no account. It accepts only the requests this dashboard makes (quarterly mosaic collection, Swiss area, July 1 mosaics, limited image size) and only from the origins you allow, so it cannot be used to spend your quota on anything else.

1. **CDSE credentials.** At [shapps.dataspace.copernicus.eu](https://shapps.dataspace.copernicus.eu/dashboard/) → *User settings* → *OAuth clients*, create a client and copy its ID and secret.
2. **Create the Worker.** Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) (free plan). Go to *Workers & Pages* → *Create* → *Create Worker*, name it `tonguesfromspace-relay`, click *Deploy*, then *Edit code*. Replace the code with the content of `worker/worker.js` and click *Deploy*.
3. **Settings.** In the Worker, open *Settings* → *Variables and Secrets* and add:
   - `CDSE_CLIENT_ID`, type *Secret*: your client ID
   - `CDSE_CLIENT_SECRET`, type *Secret*: your client secret
   - `ALLOWED_ORIGINS`, type *Text*: `https://braakhekke.github.io,http://localhost:8000`
4. **Image cache (recommended).** Go to *Storage & Databases* → *KV* → *Create* and name it `tfs-cache`. In the Worker, open *Settings* → *Bindings* → *Add* → *KV namespace*, set the variable name to `CACHE` and pick `tfs-cache`.
5. **Check the Worker.** Open `https://tonguesfromspace-relay.<your-subdomain>.workers.dev/cdse/ping`. It should show `{"relay":true,"managed":true}`.
6. **Connect the site.** In the GitHub repository, open *Settings* → *Secrets and variables* → *Actions* → *Variables* → *New repository variable*. Name it `CDSE_RELAY_URL` and paste the Worker address (without `/cdse/ping`), for example `https://tonguesfromspace-relay.<your-subdomain>.workers.dev`.
7. **Publish.** In *Actions*, run **Build data and deploy** again.

From then on the public site shows the Copernicus mosaics by default and switches to EOX by itself if the Worker or Copernicus is unavailable. The Cloudflare free plan allows 100,000 Worker requests a day; with caching, Copernicus sees only a few hundred image requests in total. Before launch, check that the CDSE terms and conditions (linked from dataspace.copernicus.eu) allow serving a public website from one account; the Copernicus data licence itself allows redistribution with attribution.

To remove the relay later, delete the `CDSE_RELAY_URL` variable and run the workflow again.

## Running locally

To use the Copernicus mosaics with your own credentials on your computer, run the dashboard locally:

```bash
python3 scripts/serve.py      # opens http://localhost:8000
```

Then choose **Copernicus quarterly mosaics** under *Imagery source* and enter a CDSE OAuth client ID and secret (CDSE dashboard → User settings → OAuth clients). Credentials stay in your browser and are only sent to Copernicus via `serve.py` on your own computer.

## Updating the data locally

```bash
python3 scripts/build_outlines.py
```

No extra packages are needed. On macOS with the python.org installer, run *Install Certificates.command* once if you get a certificate error.

## Data sources and licences

- **Glacier areas and outlines:** GLAMOS Swiss Glacier Inventories 1850, 1973 and 2023, CC BY 4.0.
- **Length change:** GLAMOS (2025), Swiss Glacier Length Change, release 2025, doi:10.18750/lengthchange.2025.r2025. Free for scientific and non-commercial use, with the source indicated.
- **Annual volume loss:** GLAMOS and Swiss Academy of Sciences (SCNAT) annual glacier reports.
- **Imagery:** EOxCloudless by EOX IT Services GmbH, and Copernicus Sentinel-2 quarterly mosaics via the Copernicus Data Space Ecosystem; both contain modified Copernicus Sentinel data.
- **Map labels:** © OpenStreetMap contributors, rendering EOX.

Because the EOX mosaics from 2017 onwards and the GLAMOS length-change data are licensed for non-commercial use only, the site as published is for non-commercial use.

No licence has been chosen yet for the code in this repository. Add a `LICENSE` file if you want others to reuse it.
