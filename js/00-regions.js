/* =====================================================================
   0. Regions: everything that differs from one part of the world to the next
      One entry per region (a country, or an area inside a country: Iceland > Vatnajökull). The page reads its data file, its scene season, its texts, its credits and its
      feature switches from the chosen region, so adding a region means adding an entry here (and its data, and its centre in worker/worker.js), not editing the code.
      The region is named by the address on the public site (/iceland/vatnajokull/) or by the link (#r=is-vatnajokull, local use and old links); no r means Switzerland. Choosing another region from the title menu opens its link and reloads, so every
      region starts clean and only its own data is loaded.

      This file is a plain script loaded synchronously (no defer) before everything else: it writes the tag of the region's data file into the page, so that file loads in
      step with the others and nothing else is fetched. Keep it free of everything but data and these few functions. build_site.py replaces the plain data names below
      (in quotes) with their hashed names.
   ===================================================================== */
/* Regions the build leaves out of the public site (build_site.py fills the list when PUBLISH_ICELAND is not 1): not in the menu, no address, #r= ignored */
const HIDDEN_REGIONS = [/*hidden-regions*/];
const REGIONS_ALL = [
  { id: 'ch', name: 'Switzerland', adj: 'Swiss', ready: true,
    data: 'data/glaciers.js',                  // window.GLACIER_DATA, made by scripts/build_outlines.py (GLAMOS)
    docTitle: 'Tongues from Space | Interactive Glaciers',
    brandLede: 'Discover the ten largest Swiss glaciers. Compare, create and share your visuals.',
    overviewName: 'Switzerland',               // the button and texts that lead back to the overview of the region
    shareTitle: 'Tongues from Space - Switzerland',
    landing: 'glacier3d',                      // the plain address opens on a 3D timelapse of the biggest glacier; 'overview' opens on the overview of the region
    /* Scene season: July to 20 September, the clearest day by cloud and snow (September first, then August, then July), the glacier alone is scored */
    season: { find: ['07-01', '09-20'], months: [9, 8, 7], pick: 'month', lastDay: { 2024: '09-14' }, minCover: 0.95, oneOrbit: false },
    outlines: { old: '1850', new: '2023', oldLegend: 'Glacier outline about 1850', newLegend: 'Glacier outline 2023', credit: 'GLAMOS' },      // the two outlines of a glacier: names for the menus, the legends of pictures and their credit
    terrain: { short: 'swisstopo · Mapterhorn', html: 'swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> via <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>' },
    trailsFile: 'data/sightline.js',      // the line-of-sight stretches of the hiking trails (the trails themselves are swisstopo tiles)
    features: { facts: true, latest: true, oldest: true, view3d: true, photos: true, streetview: true, trails: true, aerial: true, swissBase: true, radar: true, glamos: true, teaser: true, swissTab: true, sizeTool: true } },
  { id: 'is', name: 'Iceland', adj: 'Icelandic',
    children: [
      { id: 'is-vatnajokull', name: 'Vatnajökull', adj: 'Icelandic', ready: true,
        path: 'iceland/vatnajokull', pathAlso: ['iceland'],      // the address on the public site: /iceland/vatnajokull/ (and /iceland/); build_site.py writes a page for each
        data: 'data/vatnajokull.js',            // window.VATNAJOKULL, made by scripts/build_vatnajokull.py (RGI 6.0)
        docTitle: 'Tongues from Space | Vatnajökull, Iceland',
        brandLede: 'Discover the Vatnajökull ice cap in Iceland and its outlet glaciers. Compare, create and share your visuals.',
        overviewName: 'Vatnajökull',
        shareTitle: 'Tongues from Space - Vatnajökull',
        trailsFile: 'data/trails-is.js',       // footpaths and tracks (OpenStreetMap) and where the ice front is in view, scripts/build_trails_iceland.py
        landing: 'glacier3d',                  // opens on Breiðamerkurjökull as a 3D timelapse, like Switzerland on its biggest glacier; the overview of the ice cap is one click away (the title menu entry, "Vatnajökull")
        /* Scene season: 1 August to 15 October, only scenes that cover the whole picture, the clear one closest to 30 September; one orbit for all years where it can be.
           Iceland is cloudy: the scene of a year may be pinned in data/scenes.json. */
        season: { find: ['08-01', '10-15'], target: '09-30', pick: 'target', minCover: 0.999, oneOrbit: true },
        outlines: { old: '~1890', new: '2025', oldLegend: 'Glacier outline about 1890', newLegend: 'Glacier outline 2025', credit: 'Icelandic Met Office' },      // Icelandic Met Office (Hannesdóttir et al. 2020): the Little Ice Age maximum and the Sentinel-2 outline of 2025
        /* The 3D terrain: a file per outlet with one ice surface per year (data/terrain/, scripts/build_dem_iceland.py) from the dated 2 m ArcticDEM strips */
        terrain: { short: 'ArcticDEM · ÍslandsDEM', html: 'ArcticDEM strips © <a href="https://www.pgc.umn.edu/data/arcticdem/" target="_blank" rel="noopener">Polar Geospatial Center</a>, University of Minnesota (CC BY 4.0; Maxar WorldView images), ground reference ÍslandsDEM v1.0 © <a href="https://www.natt.is" target="_blank" rel="noopener">Náttúrufræðistofnun Íslands</a> and Landmælingar Íslands (CC BY 4.0)' },
        /* Landsat before Sentinel-2: static pictures of the picture box (data/landsat/<outlet>.json and <outlet>/<year>.jpg, scripts/build_landsat_iceland.py), years from `from` up to the first Sentinel-2 year; a switch under the years adds them (prefs.landsat), off at first */
        landsat: { from: 1984, first: 1985 },      // from: the first year asked for; first: the first year that has a picture (the switch says it)
        background: { mosaicYear: 2025 },      // EOX Sentinel-2 cloudless of this year is the base picture of the overview
        features: { facts: true, latest: true, oldest: true, view3d: true, photos: false, streetview: true, trails: true, aerial: false, swissBase: false, radar: false, glamos: false, teaser: false, swissTab: false, sizeTool: false } }
    ] },
  { id: 'no', name: 'Norway', adj: 'Norwegian' },
  { id: 'cl', name: 'Chile', adj: 'Chilean' },
  { id: 'np', name: 'Nepal', adj: 'Nepalese' }
];
const REGIONS = REGIONS_ALL.map(r => r.children ? {...r, children: r.children.filter(c => !HIDDEN_REGIONS.includes(c.id))} : r).filter(r => !r.children || r.children.length);
/* the entries a visitor can choose, flat, each with the country it belongs to */
const REGION_LIST = REGIONS.flatMap(r => r.children ? r.children.map(c => ({...c, parent: r})) : [r]);
const regionById = id => REGION_LIST.find(r => r.id === id && r.ready);
/* A region can have its own address on the public site (path: 'iceland/vatnajokull' -> https://tonguesfromspace.org/iceland/vatnajokull/): search engines and link previews do not see
   the #r= part. PATH_REGION is the region named by the address, SITE_BASE the folder the site lives in ('/' on such a page, '' otherwise: relative names then resolve as they always did).
   Every file the page fetches by a relative name goes through SITE_BASE (asset(), siteFile()), because the page itself sits two folders deeper. */
const PATH_REGION = (() => {
  for (const r of REGION_LIST) for (const p of [r.path, ...(r.pathAlso || [])]) {
    const m = p && r.ready && location.pathname.match(new RegExp('^(.*/)' + p + '(/(index\\.html)?)?$'));
    if (m) return {r, base: m[1]};
  }
  return null;
})();
const SITE_BASE = PATH_REGION ? PATH_REGION.base : '';
const siteFile = name => SITE_BASE + name;
const REGION = (PATH_REGION && PATH_REGION.r) || regionById(new URLSearchParams(location.hash.slice(1)).get('r')) || regionById('ch');
const FEATURES = REGION.features;
/* The link that opens a region: on the built site (it has the map of hashed names in config.js) a region with a path opens at its address, otherwise (local use) the plain address with #r= */
const regionLink = id => {
  const r = REGION_LIST.find(x => x.id === id), built = PATH_REGION || (window.TFS_CONFIG && Object.keys(window.TFS_CONFIG.assets || {}).length);
  if (built) return (SITE_BASE || location.pathname.replace(/index\.html$/, '')) + (r && r.path ? r.path + '/' : '') + location.search;
  return location.pathname + location.search + (id === 'ch' ? '' : '#r=' + id);
};
/* the data file of the region: one tag, written here so it is fetched at once and runs before the page's own scripts */
document.write(`<script defer src="${siteFile(REGION.data)}"><\/script>`);
