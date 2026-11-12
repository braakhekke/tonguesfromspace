# Zmutt science viewer — local prototype

The **actual explorer** with local scientific raster and vector data added. It uses `index.html`, `css/style.css`, `css/tokens.css`, the original controls, docks, layer menus, map, yearly 3D tongue, story and export tools. The science page no longer recreates or themes those controls. `style.css` in this directory adds only the file/date controls and local overlays.

The site build does not include this directory itself; the deploy workflow adds it as an **unlisted** page, https://tonguesfromspace.org/playground-gabriele (`scripts/build_playground.py`: noindex, no link, not in the sitemap, Disallow in robots.txt). Live, the explorer and the bridge are one bundle and GDAL's WebAssembly (over the 25 MiB Worker file limit) is read from jsDelivr, pinned to the installed gdal3.js version; field files still never leave the browser. No site navigation, glacier records, terrain bundles, original rendering code or imagery-cache version is changed.

## Run

From the repository root:

```sh
npm ci --prefix science-viewer
npm run build --prefix science-viewer
python3 scripts/serve.py --no-browser
# In another terminal:
python3 science-viewer/serve.py
```

Open **http://127.0.0.1:8003/playground-gabriele**. The science launcher supplies a local-only configuration and forwards the explorer's imagery requests to the standard local relay at `http://127.0.0.1:8000`. Local files never enter that path. Both servers bind to loopback; there is no data-upload endpoint. Use IPv4 explicitly if another static server occupies IPv6 localhost port 8000.

## Scientific formats

| Data | Local importer |
|---|---|
| Points, lines, polygons, multi-geometries | GeoJSON, JSONL / NDJSON, shapefile ZIP or sidecars, WKT |
| Survey tables | CSV / TSV with XY or WKT; explicit column and CRS selection |
| GPS / Google Earth | GPX, KML, KMZ; geometry and attributes (not external image overlays or network links) |
| GIS containers | GeoPackage, FlatGeobuf, GML, DXF, MapInfo and formats supported by the bundled GDAL build |
| Raster measurements / RGB | GeoTIFF / BigTIFF directly; GDAL converts ASCII, ENVI, georeferenced PNG/JPEG and other supported grids |
| Temporal grids | Classic NetCDF with regular 1D latitude/longitude axes and optional leading time dimension |
| Point clouds | LAS / LAZ through 1.3, up to 100,000 points; explicit source CRS; draped points, not volumetric 3D |

Select companions together (.prj/.dbf/.shx, .hdr, world files). Missing CRS prompts a selection. Never guess a CRS based on the glacier. Coordinates and attributes are retained for inspection; numeric properties can be selected for colouring. Selecting another arbitrary property clears its measurement unit rather than transferring an unrelated unit. Vector acquisition dates and units come from properties; CSV mapping selects existing columns, never free text values. Geometry without measurements stays visible in blue. Dates and units split layers, capped at 512 groups.

Direct GeoTIFFs retain bounded File/Blob reads, including files over 5 GB. Other direct formats are limited to 64 MiB; expanded archives also to 64 MiB. Vectors allow at most 200,000 features / 1,500,000 vertices. Classic NetCDF allows 8 million values / 32 slices. GDAL raster conversion permits 12 million input values and a 128 MiB output; vector outputs are capped at 64 MiB. These are conservative preview limits, not performance guarantees. Every GDAL conversion runs in its own local worker, which is terminated afterwards to release its filesystem and WebAssembly memory.

GDAL raster fallback reprojects to EPSG:4326 with nearest neighbour; inspection explicitly refers to the converted grid. It does not represent source-grid pixel indices. Direct supported GeoTIFFs retain original-grid inspection. NetCDF CF Gregorian dates are computed from file time coordinates and labelled as computed. NetCDF-4/HDF5, irregular/curvilinear grids, LAS 1.4/COPC and VRT require desktop conversion first. This is broad format support, not universal scientific-container support.

## Multiple observations

Open one or multiple supported files. Files are added to the session; removing one file releases all its bands. Each band is selectable. A band with an explicit acquisition date can also be a temporal observation, so a single multitemporal band stack is supported when its per-band dates are recorded in embedded GDAL metadata.

The explorer's original **One year / Slider / Timelapse** buttons remain in use. Choose the timeline source:

- **Satellite years:** the explorer's original timeline. Local observations with a matching acquisition year are overlaid; when several dates match, the latest date with compatible units is used. A lone observation or an undated observation may be viewed against another reference year, with its actual acquisition metadata shown separately.
- **Field dates:** chronological local observations with compatible recorded units (or unlabelled stored values). Slider lets you select two exact observations, including two dates or times in the same year. Timelapse plays the selected compatible sequence; its original Play/Pause, frame slider, speed, loop and dock scrub controls operate on field frames. Playback waits for local frames to render, so decoding speed and hardware can limit the achieved frame rate. Starting playback at the end restarts from the first observation.

Dates remain exact file metadata strings, never invented from filenames or modification times. Undated files stay available manually but are excluded from ordered playback. Different units or different unapplied scale/offset conventions are not silently animated as one sequence. Choose another dataset to use its compatible sequence. A common colour range applies to the series, avoiding automatic range changes between frames. Ordinary multiband files with one acquisition date are grouped by band index across files; their channels are not treated as separate dates. A file whose bands record distinct acquisition dates is treated as a temporal stack.

For each local observation, the satellite reference uses the same year if an image exists. Otherwise it keeps an available reference year and states that year separately; it does not invent a matching satellite scene. The tongue follows the available reference year's existing surface model. Full-glacier terrain stays fixed. There is no interpolation between local acquisitions and no inference of terrain changes from a thermal survey.

## File metadata and values

Date and unit are read-only properties of the open file and selected band. Supported embedded GDAL acquisition fields are `ACQUISITIONDATETIME`, `ACQUISITION_DATE`, `DATE_ACQUIRED` and `SENSING_TIME`. Band metadata take precedence over dataset metadata. Conflicting dates stay unknown for sequence purposes. Invalid calendar dates never enable playback.

Units come from `UNITTYPE`, `UNITS` or `UNIT`, with band values preferred. Coordinate-system units are not measurement units. Original date and unit strings are preserved. “Not recorded in file” means no supported embedded field was found; generic TIFF creation dates, filesystem timestamps and filenames are never substituted. Vendor XML, EXIF acquisition tags and external `.aux.xml` files are not interpreted yet.

Pixels remain stored values: no calibration, unit conversion or GDAL scale/offset is applied. If scale/offset is non-identity, File details retain them and the card reports the declared physical unit, but displayed / inspected raw pixels are not labelled with that physical unit. Such sequences also need matching stored-value conventions.

Click the map or Shift-click 3D terrain to inspect the original source pixel. In comparison mode the pointer's side determines the observation. NoData and out-of-coverage pixels remain transparent. Display overlays are bounded, nearest-neighbour previews; inspection reads the base-resolution source pixel. Browser / GPU texture filtering can smooth displayed colours and those colours are not measurements.

Metadata references: GDAL's [raster data model](https://gdal.org/en/stable/user/raster_data_model.html), [GeoTIFF driver](https://gdal.org/en/stable/drivers/raster/gtiff.html) and [GeoTIFFImage API](https://geotiffjs.github.io/geotiff.js/classes/geotiff.GeoTIFFImage.html).

## Full-glacier 3D

The additional **Full 3D** view covers Zmutt and its surroundings. It requests Mapterhorn terrain tiles for this area only, embeds the existing 2023 tongue surface and blends the strip boundary for display. It is a contextual composite of different survey dates, not a glacier-wide 2023 survey. The surface stays fixed while the imagery and field data change. The original map dock and slider controls are reused. Original map measuring tools are hidden in this additional mode because they would measure the map behind the terrain; use the original map / yearly tongue modes for those tools.

Original imagery and layer choices are used for its textures. Point labels, radar-pin interactions, cross-sections, photographs and other original 3D tools remain available in the yearly tongue view. Full-glacier detail is bounded; use the tongue view and source-pixel inspection for closer examination.

Terrain sources: Mapterhorn [data access](https://mapterhorn.com/data-access/), [attribution](https://mapterhorn.com/attribution/) and [source catalog](https://download.mapterhorn.com/attribution.json). The catalog identifies swissALTI3D, “Federal Office of Topography swisstopo”, licence “Open Government Data”. Survey dates are not inferred from edition / access dates. Tongue-model provenance stays in `data/yearly/B57-05.json` and the site's original sources.

## Memory and large files

The main reader worker keeps separate readers and metadata for each dataset. Every request explicitly selects its dataset and band. Direct GeoTIFFs avoid loading the entire raster; other formats have the in-memory limits above. Map and 3D render only bounded windows. Internal overviews are chosen when appropriate. Identical pending reads are shared; rendered previews use a four-entry LRU cache. Newer render generations supersede stale asynchronous results, including 3D texture updates.

Supported CRS: EPSG:2056, EPSG:21781, EPSG:3857, EPSG:4326 and WGS84 UTM. Other CRS, rotated grids and pixel-is-point rasters use the limited GDAL conversion fallback. Large surveys should be tiled with internal overviews. A conservative decoded-block budget refuses views that would decode too much data; zoom in or prepare an optimized copy. This bounds normal work, but is not a guarantee for every malformed file or codec.

The large-file test uses a sparse BigTIFF larger than 5 GB and verifies that it opens metadata but refuses an oversized read. It is not a performance benchmark of a real 5 GB thermal survey. Gabi's actual survey and hardware still need a trial.

## Saving, sharing and exports

Save data settings stores file names/sizes, the selected file/band, display range, opacity, visibility, timeline source, comparison dates, mode and full-view choice. It contains no raster pixels. Reopen the original files before restoring. Date/unit overrides in settings are ignored; metadata always come from the files. Camera positions and a running playback state are not persisted. Reloading closes the local session.

To share a dataset with the owner, send its original files or a transfer link separately. The original explorer's exports and gallery tools remain available with their original background-layer behaviour. Exporting local field-data series as a scientifically attributed image/video is not implemented; do not assume those native exports include local datasets. No automatic file transfer was added.

The site's original credits, source lists and licences remain. This viewer is non-commercial. Dependencies retain their licences in node_modules and package-lock.json. GDAL3.js is LGPL-2.1-or-later; its licence is copied beside the locally served WebAssembly assets. Source and build instructions: https://github.com/bugra9/gdal3.js (version 2.8.1). The package is unmodified, loaded as a separate classic worker and replaceable by rebuilding/copying those assets. Other import dependencies include shpjs, PapaParse, fflate, togeojson, xmldom, wellknown, netcdfjs and loaders.gl; retain their package licences when redistributing.

## Validation

```sh
python3 science-viewer/test_viewer.py
```

Requires Playwright Chromium, NumPy, tifffile, Pillow, rasterio, pyshp and SciPy. Tests use local generated files and mocked imagery / terrain, without Copernicus requests. They cover actual explorer controls/style, metadata-only fields, separate dataset values, same-year comparisons, playback/pause/scrub, temporal bands, incompatible units, settings, removal, large-file refusal, bounded caching, original / full 3D and phone layout. Real-device Safari / touch behaviour remains unverified.

The worker bundle and `node_modules/` are ignored. Rebuild after changing `raster-worker.js` or `file-metadata.js`. The bridge uses the unbundled local explorer modules, not the deployed site's bundle.
