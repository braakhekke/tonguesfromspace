# Swiss Glacier Tongues from Space

Compare and animate Sentinel-2 satellite images of the tongues of the ten largest Swiss glaciers, from 2016 to the latest available year, next to glacier figures from Glacier Monitoring Switzerland (GLAMOS).

Created by Jochem Braakhekke for public glacier awareness. See also [For Your Ice](https://foryourice.org/).

**Live site:** https://braakhekke.github.io/tonguesfromspace/

## What it does

- **Satellite images:** for every glacier and year, the clearest late-summer Sentinel-2 scene: the best one in September, otherwise August, otherwise July, scored for cloud and snow cover.
- **Start view:** all of Switzerland with the ten glaciers as red, clickable boxes.
- **Compare:** swipe between two years.
- **Timelapse:** play a range of years as an animation.
- **Colours:** true color, false color (near infrared) and Parece (B8A, B1, B12; experimental).
- **Map layers:** glacier boxes, ice thickness (Grab et al. 2021), glacier outline of 1850 and today, a Sentinel-2 summer mosaic around the scene, OpenStreetMap base map, place names. The layer panel can be minimized.
- **Measure:** draw lines and areas; lengths and areas are geodesic.
- **Key figures:** area (about 1850, 1973, 2023) and tongue length change, all from GLAMOS.
- **Swiss context:** share of the national ice volume lost each year since 2016, and **How much water is that?**: the melted ice in litres, compared with swimming pools, Lake Zurich, Switzerland's tap water and each resident's share, plus a live counter.
- **Create animation:** a timelapse, or a slider between two years, as video for Instagram, TikTok and others. Frame the tongue on the map and get an MP4 (9:16 for Reels and TikTok, or 4:5 for the Instagram feed) with title, years, scene dates, scale bar, optional 1850 outline, the national volume loss and all credits. Made in the browser; on phones it opens the share sheet.
- **Share:** a link to the current glacier, mode and years.
- **Phones:** map first, compact controls under the map, two fingers to move the map, landscape layout.

## Repository layout

```
index.html                     the dashboard (a single page, no build step)
glaciers.js                    GLAMOS data, created and updated automatically by the workflow
config.js                      written by the workflow on publish: address of the Copernicus relay
scripts/build_outlines.py      downloads GLAMOS inventories + length changes, writes glaciers.js
scripts/serve.py               local server + Copernicus relay (holds your credentials when running locally)
worker/worker.js               Cloudflare Worker: Copernicus relay for the public site (holds the site's credentials)
worker/wrangler.toml           optional, for deploying the Worker from the command line
.github/workflows/deploy.yml   builds glaciers.js and publishes the site on GitHub Pages
```

## Publishing on GitHub Pages (one time)

1. Upload all files to the repository, including the hidden `.github` folder (see below).
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Open the **Actions** tab, choose **Build data and deploy** and click **Run workflow**.

The workflow downloads the GLAMOS data, commits `glaciers.js`, and publishes the site. After that it runs by itself on every push to `main` and on the 1st of every month, so new GLAMOS releases are picked up automatically. New satellite scenes appear in the dashboard by themselves.

**Uploading through the GitHub website:** on a Mac, folders starting with a dot are hidden in Finder. Press **Cmd + Shift + .** in Finder to show them before dragging the folder contents into **Add file → Upload files**. If `.github` does not come along, create the file `.github/workflows/deploy.yml` in GitHub with **Add file → Create new file** and paste its content.

## Satellite images

All images are Copernicus Sentinel-2 scenes from the Copernicus Data Space Ecosystem (CDSE), free for any use with attribution. The scene of each year is chosen with Level-2A (it has the scene classification for clouds and snow); the image itself is rendered from Level-1C of the same day with a simple haze correction, because Level-2A brightens shaded slopes in a way that looks unnatural in the mountains.

**How the scene of each year is chosen.** For the selected glacier, one request to the CDSE Statistical API scores every Sentinel-2 acquisition from July 1 to September 20 of that year, using the scene classification (SCL): the share of cloud and cloud shadow, and the share of snow and ice. Scenes that cover less than 95 % of the image area are skipped. The dashboard then takes:

1. the September scene (until 20 September; in 2024 until 14 September, because of heavy snowfall on the 15th) with at most 5 % cloud and the least snow;
2. if September has none, the best one from August;
3. if August has none, the best one from July;
4. if no month has a clear scene, the least cloudy scene of the summer (up to 30 % cloud), marked "some clouds".

Years without any usable scene cannot be selected. The chosen day is then rendered with the Process API. The date of each scene is shown under the year on the map. These thresholds are at the top of section 3 in `index.html` (`CDSE.maxCloud`, `CDSE.minCover`, `CDSE.fallbackCloud`).

**Why a relay is needed.** Copernicus requires a login, and browsers block that login when a web page calls it directly. So all Copernicus requests go through a relay that holds the credentials: the Cloudflare Worker on the public site, `scripts/serve.py` on your own computer. Visitors never need an account. Without a relay, the site still shows the map, outlines and figures, and says that satellite images are not connected.

## Satellite images on the public site (Cloudflare Worker, free)

The Worker logs in to Copernicus with **your** CDSE credentials, which are stored as encrypted Cloudflare secrets, and caches every answer, so each scene search and each image is requested from Copernicus only once. Visitors need no account. It accepts only the two requests this dashboard makes (scoring one summer of Sentinel-2 L2A scenes, and the image of one summer day, both over Switzerland and at limited size) and only from the origins you allow, so it cannot be used to spend your quota on anything else.

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

From then on the public site shows the satellite images. The Cloudflare free plan allows 100,000 Worker requests a day; with caching, Copernicus sees about 11 scene searches and up to 22 images per glacier and colour mode, once. Before launch, check that the CDSE terms and conditions (linked from dataspace.copernicus.eu) allow serving a public website from one account; the Copernicus data licence itself allows redistribution with attribution.

To remove the relay later, delete the `CDSE_RELAY_URL` variable and run the workflow again.

## Running locally

```bash
python3 scripts/serve.py      # opens http://localhost:8000
```

`serve.py` needs a CDSE OAuth client (CDSE dashboard → User settings → OAuth clients). It takes the credentials from the environment variables `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET`, or asks for them when it starts and can save them in `scripts/.cdse-credentials`. That file is listed in `.gitignore` and is never uploaded.

## Updating the data locally

```bash
python3 scripts/build_outlines.py
```

No extra packages are needed. On macOS with the python.org installer, run *Install Certificates.command* once if you get a certificate error.

## Data sources and licences

- **Glacier areas and outlines:** GLAMOS Swiss Glacier Inventories 1850, 1973 and 2023, CC BY 4.0.
- **Length change:** GLAMOS (2025), Swiss Glacier Length Change, release 2025, doi:10.18750/lengthchange.2025.r2025. Free for scientific and non-commercial use, with the source indicated.
- **Annual volume loss:** GLAMOS and Swiss Academy of Sciences (SCNAT) annual glacier reports. National ice volume: 46.4 km³ at the end of 2024 (GLAMOS annual report 2024).
- **Ice thickness:** Grab, M. et al. (2021), Ice thickness distribution of all Swiss glaciers, Journal of Glaciology 67(266), via the swisstopo map service (layer ch.swisstopo.geologie-gletschermaechtigkeit).
- **Water use:** SVGW water statistics (about 900–950 million m³ a year; 142 litres per person per day in households).
- **Imagery:** Copernicus Sentinel-2 Level-1C and Level-2A via the Copernicus Data Space Ecosystem; contains modified Copernicus Sentinel data. Free for any use with attribution.
- **Background:** Sentinel-2 cloudless 2024 by EOX IT Services GmbH (s2maps.eu), CC BY-NC-SA 4.0.
- **Base map:** © OpenStreetMap contributors (ODbL), tiles from tile.openstreetmap.org, used under the OpenStreetMap tile usage policy.
- **Map labels:** © OpenStreetMap contributors, rendering EOX.

Because the GLAMOS length-change data are licensed for non-commercial use only, the site as published is for non-commercial use.

No licence has been chosen yet for the code in this repository. Add a `LICENSE` file if you want others to reuse it.
