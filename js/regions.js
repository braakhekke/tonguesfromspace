/* =====================================================================
   Region records: the data of every region, nothing else (js/00-regions.js has the logic that picks one, js/home.html and the explorer both read this file).
   One entry per region (a country, or an area inside a country: Iceland > Vatnajökull). The page reads its data file, its scene season, its texts, its credits and
   its feature switches from the chosen region, so adding a region means adding an entry here (and its data, and its centre in worker/worker.js), not editing code.
   `picker` is what the front page needs: the map position, a line of text. build_site.py replaces the plain data names below (in quotes) with their hashed names.
   A plain script (no module): the front page loads it too.
   ===================================================================== */
/* Regions the build leaves out of the public site (build_site.py fills the list when PUBLISH_ICELAND is not 1): not in the menu, no address, #r= ignored */
const HIDDEN_REGIONS = [/*hidden-regions*/];
/* the credit lines of the outlines of each region (map credits and the 3D view) */
const IS_OUTLINE_CREDIT = 'Outlines: <a href="https://islenskirjoklar.is" target="_blank" rel="noopener">Icelandic Met Office</a> (Hannesdóttir et al. 2020, CC BY 4.0); basins: <a href="https://doi.org/10.7265/N5-RGI-60" target="_blank" rel="noopener">Randolph Glacier Inventory 6.0</a>';
const NO_OUTLINE_CREDIT = 'Outlines: <a href="https://www.nve.no/hydrology/glaciers/" target="_blank" rel="noopener">NVE</a> (glacier inventories 1947–1985 and 2018–2019, Andreassen et al. 2022)';
const SV_OUTLINE_CREDIT = 'Outlines: <a href="https://geodata.npolar.no" target="_blank" rel="noopener">Norwegian Polar Institute</a> (glacier outlines 1936–1972 and 2020, CC BY 4.0)';
const REGIONS_ALL = [
  { id: 'ch', name: 'Switzerland', adj: 'Swiss', ready: true,
    picker: { ll: [46.45, 8.1], zoom: 7, text: 'The ten largest Swiss glaciers, with GLAMOS statistics.' },      // the front page (home.html): where the region sits on the world map
    path: 'switzerland',                         // the address on the public site: /switzerland/ (the front page / is the region picker, home.html)
    glacierPages: true,                        // the built site has a page for each glacier: /switzerland/aletsch/ (own title and picture for link previews); the address follows the chosen glacier
    glacierSlugs: { 'sgi-B56-03': 'findel', 'sgi-B53-04': 'fee' },      // the address of a glacier is its id, except for these two (scripts/build_site.py reads this line)
    data: 'data/glaciers.js',                  // window.GLACIER_DATA, made by scripts/build_outlines.py (GLAMOS)
    docTitle: 'Tongues from Space | Swiss glaciers',
    brandLede: 'Discover the ten largest Swiss glaciers. Compare, create and share your visuals.',
    streetviewIn: 'Aletsch',                   // what the Street View credit names
    overviewName: 'Switzerland',               // the button and texts that lead back to the overview of the region
    shareTitle: 'Tongues from Space - Switzerland',
    landing: 'glacier3d',                      // the plain address opens on a 3D timelapse of the biggest glacier; 'overview' opens on the overview of the region
    /* Scene season: July to 20 September, the clearest day by cloud and snow (September first, then August, then July), the glacier alone is scored */
    season: { find: ['07-01', '09-20'], months: [9, 8, 7], pick: 'month', lastDay: { 2024: '09-14' }, minCover: 0.95, oneOrbit: false },
    outlines: { old: '1850', new: '2023', oldLegend: 'Glacier outline about 1850', newLegend: 'Glacier outline 2023', credit: 'GLAMOS' },      // the two outlines of a glacier: names for the menus, the legends of pictures and their credit
    landsat: { from: 1984, first: 1985 },      // Landsat 5 and 7 pictures before Sentinel-2 (scripts/build_landsat.py)
    terrain: { short: 'swisstopo · Mapterhorn', html: 'swissALTI3D © <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a> via <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>' },
    trailsFile: 'data/sightline.js',      // the line-of-sight stretches of the hiking trails (the trails themselves are swisstopo tiles)
    features: { facts: true, latest: true, oldest: true, view3d: true, photos: true, streetview: true, trails: true, aerial: true, swisstopo: true, speed: true, radar: true, glamos: true, teaser: true, swissTab: true, sizeTool: true } },
  { id: 'is', name: 'Iceland', adj: 'Icelandic', ready: true, rgi: true, streetviewIn: 'Iceland', aliases: ['is-vatnajokull', 'is-rest'],      // aliases: the old region ids of old links (#r=)
    picker: { ll: [64.9, -18.4], zoom: 7, text: 'The ice caps and glaciers of Iceland, with the outlets of Vatnajökull.' },      // the front page (home.html): where the region sits on the world map
    path: 'iceland', pathAlso: ['iceland/vatnajokull', 'iceland/rest'],      // the address on the public site: /iceland/ (the two older addresses show the same page); build_site.py writes a page for each
    data: 'data/iceland-all.js',            // window.REGION_ICE, made by scripts/build_iceland_all.py from data/vatnajokull.js (build_vatnajokull.py) and data/iceland.js (build_regions.py iceland), RGI 6.0
    docTitle: 'Tongues from Space | Iceland',
    brandLede: 'Discover the glaciers of Iceland: the outlets of Vatnajökull, Langjökull, Hofsjökull, Mýrdalsjökull and more. Compare, create and share your visuals.',
    overviewName: 'Iceland',
    shareTitle: 'Tongues from Space - Iceland',
    sightDem: 'ÍslandsDEM',
    trailsFile: ['data/trails-is.js', 'data/trails-vatnajokull.js', 'data/trails-iceland.js'],       // footpaths and tracks (OpenStreetMap) and where the ice front is in view, scripts/build_trails_iceland.py
    landingGlacier: 'breidamerkurjokull',   // the glacier it opens on (else the biggest)
    landing: 'glacier3d',                  // opens on Breiðamerkurjökull as a 3D timelapse, like Switzerland on its biggest glacier; the overview of Iceland is one click away (the title menu entry, "Iceland")
    /* Scene season: 1 August to 15 October, only scenes that cover the whole picture, the clear one closest to 30 September; one orbit for all years where it can be.
       Iceland is cloudy: the scene of a year may be pinned in data/scenes.json. */
    season: { find: ['08-01', '10-15'], target: '09-30', pick: 'target', minCover: 0.999, oneOrbit: true },
    outlines: { old: '~1890', new: '2025', oldLegend: 'Glacier outline about 1890', newLegend: 'Glacier outline 2025', credit: 'Icelandic Met Office', html: IS_OUTLINE_CREDIT },      // Icelandic Met Office (Hannesdóttir et al. 2020): the Little Ice Age maximum and the Sentinel-2 outline of 2025
    inventory: { short: 'RGI 6.0', about: 'about 2000', source: 'is_rgi', listAll: false },      // the record of the glacier in the data file (`rgi`): where its area, length and heights come from
    unnamed: 'Unnamed glacier', units: 'glaciers',
    place: { canton: '', range: 'Iceland' }, sources: ['is_rgi', 'is_imo', 'is_gudm', 's2', 'landsat', 'is_arctic', 'is_dem', 'mapterhorn', 'is_osm', 'is_wiki', 'streetview', 'bg', 'me'],
    rankNote: 'Ice caps and glaciers, and the drainage basins of the outlets of Vatnajökull, of the Randolph Glacier Inventory 6.0, about 2000.',
    /* The 3D terrain: a file per outlet with one ice surface per year (data/terrain/, scripts/build_dem_iceland.py and build_dem_arctic.py) from the dated 2 m ArcticDEM strips; the others use the terrain tiles */
    terrain: { short: 'ÍslandsDEM · Mapterhorn', html: 'ÍslandsDEM v1.0 © <a href="https://www.natt.is" target="_blank" rel="noopener">Náttúrufræðistofnun Íslands</a> and Landmælingar Íslands (CC BY 4.0), as terrain tiles by <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>' },
    terrainZoom: 12,      // Mapterhorn's finest tiles over Iceland (outlets without a terrain file)
    /* Landsat before Sentinel-2: static pictures of the picture box (data/landsat/<outlet>.json and <outlet>/<year>.jpg, scripts/build_landsat.py), years from `from` up to the first Sentinel-2 year; a switch under the years adds them (prefs.landsat), off at first */
    landsat: { from: 1984, first: 1985 },      // from: the first year asked for; first: the first year that has a picture (the switch says it)
    background: { mosaicYear: 2025 },      // EOX Sentinel-2 cloudless of this year is the base picture of the overview
    features: { facts: true, latest: true, oldest: true, view3d: true, photos: false, streetview: true, trails: true, aerial: false, swisstopo: false, speed: false, radar: false, glamos: false, teaser: false, swissTab: false, sizeTool: false } },
  { id: 'no-mainland', name: 'Norway', adj: 'Norwegian', ready: true, rgi: true,
    picker: { ll: [66.6, 14.0], zoom: 5, text: 'The ten largest main glaciers of Norway.' },      // the front page (home.html): where the region sits on the world map
    path: 'norway',
    data: 'data/norway.js',                // window.REGION_ICE, made by scripts/build_regions.py norway (NVE)
    docTitle: 'Tongues from Space | Norway',
    brandLede: 'Discover the ten largest glaciers of Norway: Jostedalsbreen, Svartisen, Folgefonna and more. Compare, create and share your visuals.',
    overviewName: 'Norway',
    shareTitle: 'Tongues from Space - Norway',
    sightDem: 'the terrain tiles of Mapterhorn',
    trailsFile: 'data/trails-norway.js',
    landing: 'glacier3d',                  // opens on Jostedalsbreen
    /* Scene season: 20 July to 30 September, only scenes that cover the whole picture, the clear one closest to 1 September (end of the melt season, before the first autumn snow; NVE's own
       inventory of 2018-2019 used scenes of late August and early September); one orbit for all years where it can be. */
    season: { find: ['07-20', '09-30'], target: '09-01', pick: 'target', minCover: 0.999, oneOrbit: true },
    outlines: { old: '1947–1985', new: '2018–2019', oldLegend: 'Glacier outline 1947–1985', newLegend: 'Glacier outline 2018–2019', credit: 'NVE', html: NO_OUTLINE_CREDIT },
    inventory: { short: 'NVE', about: '2018–2019', source: 'no_nve', listAll: false },
    unnamed: 'Unnamed glacier', units: 'glaciers',
    place: { canton: '', range: 'Norway' }, sources: ['no_nve', 'no_old', 's2', 'landsat', 'mapterhorn', 'is_arctic', 'is_osm', 'bg', 'me'],
    rankNote: 'Glaciers and ice caps by area, NVE glacier inventory 2018–2019.',
    terrain: { short: 'Kartverket · Mapterhorn', html: 'Terrengmodell (DTM) © <a href="https://www.kartverket.no/api-og-data/terrengdata" target="_blank" rel="noopener">Kartverket</a> (CC BY 4.0), as terrain tiles by <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>' },
    terrainZoom: 13,
    landsat: { from: 1984, first: 1985 },      // Landsat 5 and 7 pictures before Sentinel-2 (scripts/build_landsat.py)
    background: { mosaicYear: 2025 },
    features: { facts: true, latest: true, oldest: false, view3d: true, photos: false, streetview: false, trails: true, aerial: false, swisstopo: false, speed: false, radar: false, glamos: false, teaser: false, swissTab: false, sizeTool: false } },
  { id: 'no-svalbard', name: 'Svalbard', adj: 'Norwegian', ready: true, rgi: true,
    picker: { ll: [78.8, 17.0], zoom: 5, text: 'The ten largest named glacier units of Svalbard.' },      // the front page (home.html): where the region sits on the world map
    path: 'svalbard',
    data: 'data/svalbard.js',              // window.REGION_ICE, made by scripts/build_regions.py svalbard (Norwegian Polar Institute)
    docTitle: 'Tongues from Space | Svalbard',
    brandLede: 'Discover ten of the largest glaciers of the Svalbard (Spitsbergen) archipelago: Negribreen, Bråsvellbreen, Monacobreen and more. Compare, create and share your visuals.',
    overviewName: 'Svalbard',
    shareTitle: 'Tongues from Space - Svalbard',
    sightDem: 'the terrain tiles of Mapterhorn',
    trailsFile: 'data/trails-svalbard.js',
    landing: 'glacier3d',                  // opens on Negribreen
    /* Scene season: 20 July to 15 September, the clear scene closest to 25 August: Svalbard's ice is bare for a short time, from July to the first snow in September */
    season: { find: ['07-20', '09-15'], target: '08-25', pick: 'target', minCover: 0.999, oneOrbit: true },
    outlines: { old: '1936–1972', new: '2020', oldLegend: 'Glacier outline 1936–1972', newLegend: 'Glacier outline 2020', credit: 'Norwegian Polar Institute', html: SV_OUTLINE_CREDIT },
    inventory: { short: 'NPI', about: '2001–2010', source: 'sj_npi', listAll: false },
    unnamed: 'Unnamed glacier', units: 'glaciers',
    place: { canton: '', range: 'Svalbard' }, sources: ['sj_npi', 's2', 'landsat', 'mapterhorn', 'is_arctic', 'is_osm', 'bg', 'me'],
    rankNote: 'Named glacier units by area in 2020, Norwegian Polar Institute.',
    terrain: { short: 'NPI · Mapterhorn', html: 'S0 Terrengmodell Svalbard © <a href="https://data.npolar.no/dataset/dce53a47-c726-4845-85c3-a65b46fe2fea" target="_blank" rel="noopener">Norwegian Polar Institute</a> (CC BY 4.0), as terrain tiles by <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">Mapterhorn</a>' },
    terrainZoom: 12,
    landsat: { from: 1984, first: 1985 },      // Landsat 5 and 7 pictures before Sentinel-2 (scripts/build_landsat.py)
    background: { mosaicYear: 2025 },
    features: { facts: true, latest: true, oldest: false, view3d: true, photos: false, streetview: false, trails: true, aerial: false, swisstopo: false, speed: false, radar: false, glamos: false, teaser: false, swissTab: false, sizeTool: false } },
  { id: 'cl', name: 'Chile', adj: 'Chilean', picker: { ll: [-49.5, -73.2], zoom: 5 } },
  { id: 'np', name: 'Nepal', adj: 'Nepalese', picker: { ll: [28.2, 85.0], zoom: 6 } }
];
