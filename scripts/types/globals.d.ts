// Names the page's scripts use that are not declared in them. Checked by `tsc -p jsconfig.json` (see jsconfig.json).
declare const turnstile: any;      // Cloudflare Turnstile widget, loaded on demand from challenges.cloudflare.com

interface Window {
  GLACIER_DATA: any;          // glaciers.js (made by scripts/build_outlines.py)
  GLACIER_OUTLINES: any;      // the 2023 outline files of the public site (scripts/build_site.py)
  REGION_ICE: any;            // the data file of an ice-cap region (scripts/build_vatnajokull.py, scripts/build_regions.py)
  GLACIER_TRAILS: any;        // trails-is.js (scripts/build_trails_iceland.py)
  GLACIER_SIGHT: any;         // sightline.js (scripts/build_sightline.py)
  GLACIER_BOXES: any;         // boxes.js (scripts/tools/box-editor.html)
  GLACIER_THICKNESS: any;     // thickness.js
  TFS_CONFIG: { relay?: string; assets?: Record<string, string>; streetViewKey?: string };      // config.js, written by the deploy workflow
}

// DOM lookups return `any` here. The page reads `.checked`, `.value`, `.dataset` ... of elements it knows by id; typing each of those lookups would add
// hundreds of casts and catch nothing that a misspelled id (a runtime null) does not. What the check is for: misspelled names, wrong argument counts, wrong properties of our own objects.
interface Document { getElementById(elementId: string): any; }
interface ParentNode { querySelector(selectors: string): any; querySelectorAll(selectors: string): NodeListOf<any>; }
interface EventTarget { checked: any; value: any; open: any; dataset: any; classList: any; tagName: any; closest(selectors: string): any; matches(selectors: string): any; }

// Leaflet is loaded from a CDN and used with plain [lat, lng] arrays everywhere; its strict tuple types would flag every one of them, so it is untyped here.
declare const L: any;
// `new Promise(res => ...)` with `res()` and no value is used throughout.
interface PromiseConstructor { new (executor: (resolve: (value?: any) => void, reject: (reason?: any) => void) => void): Promise<any>; }

interface Window { turnstile: any; __lastVideo: any; }
// A few functions carry a timer on themselves (showNotice.t, sync3D.t) as a debounce handle.
interface Function { t?: any; }

interface Navigator { deviceMemory?: number; }

// Names exported by js/01-data.js (a module) that the classic scripts read as globals; same list as its window bridge.
declare const FIRST_YEAR: typeof import('../../js/01-data.js').FIRST_YEAR;
declare const CURRENT_YEAR: typeof import('../../js/01-data.js').CURRENT_YEAR;
declare const YEARS: typeof import('../../js/01-data.js').YEARS;
declare const LANDSAT_YEARS: typeof import('../../js/01-data.js').LANDSAT_YEARS;
declare const SWISS_SERIES: typeof import('../../js/01-data.js').SWISS_SERIES;
declare const ICE_2024: typeof import('../../js/01-data.js').ICE_2024;
declare const iceVolume: typeof import('../../js/01-data.js').iceVolume;
declare const EIFFEL_M: typeof import('../../js/01-data.js').EIFFEL_M;
declare const PITCH_M2: typeof import('../../js/01-data.js').PITCH_M2;
declare const BUS_M: typeof import('../../js/01-data.js').BUS_M;
declare const LAKE_ZURICH_KM3: typeof import('../../js/01-data.js').LAKE_ZURICH_KM3;
declare const POOL_L: typeof import('../../js/01-data.js').POOL_L;
declare const SWISS_SUPPLY_KM3: typeof import('../../js/01-data.js').SWISS_SUPPLY_KM3;
declare const HOUSEHOLD_L_DAY: typeof import('../../js/01-data.js').HOUSEHOLD_L_DAY;
declare const SWISS_POP: typeof import('../../js/01-data.js').SWISS_POP;
declare const VOLUME_LOSS: typeof import('../../js/01-data.js').VOLUME_LOSS;
declare const DEFAULTS: typeof import('../../js/01-data.js').DEFAULTS;
declare const TRAILS: typeof import('../../js/01-data.js').TRAILS;
declare const lv95: typeof import('../../js/01-data.js').lv95;
declare const TRAIL_LAYERS: typeof import('../../js/01-data.js').TRAIL_LAYERS;
declare const trailMaps: typeof import('../../js/01-data.js').trailMaps;
declare const trailsHtml: typeof import('../../js/01-data.js').trailsHtml;
declare const GLACIER_INFO: typeof import('../../js/01-data.js').GLACIER_INFO;

// Names exported by js/02-glaciers.js (a module), read as globals by classic scripts.
declare const DATA: typeof import('../../js/02-glaciers.js').DATA;
declare const norm: typeof import('../../js/02-glaciers.js').norm;
declare const PLACE: typeof import('../../js/02-glaciers.js').PLACE;
declare const unionBbox: typeof import('../../js/02-glaciers.js').unionBbox;
declare const outlineLoads: typeof import('../../js/02-glaciers.js').outlineLoads;
declare const needsOutline: typeof import('../../js/02-glaciers.js').needsOutline;
declare const loadOutline: typeof import('../../js/02-glaciers.js').loadOutline;
declare const ICECAP: typeof import('../../js/02-glaciers.js').ICECAP;
declare const ringsBounds: typeof import('../../js/02-glaciers.js').ringsBounds;
declare const boxRecord: typeof import('../../js/02-glaciers.js').boxRecord;
declare var GLACIERS: typeof import('../../js/02-glaciers.js').GLACIERS;
declare const shortName: typeof import('../../js/02-glaciers.js').shortName;
declare const padBounds: typeof import('../../js/02-glaciers.js').padBounds;
declare const rankArea: typeof import('../../js/02-glaciers.js').rankArea;
declare const CURRENT_LENGTH: typeof import('../../js/02-glaciers.js').CURRENT_LENGTH;
declare const areaText: typeof import('../../js/02-glaciers.js').areaText;
declare const lineGeom: typeof import('../../js/02-glaciers.js').lineGeom;
declare const hasOldOutline: typeof import('../../js/02-glaciers.js').hasOldOutline;
declare const oldOutlineGeom: typeof import('../../js/02-glaciers.js').oldOutlineGeom;
declare const newOutlineGeom: typeof import('../../js/02-glaciers.js').newOutlineGeom;
declare const eachPiece: typeof import('../../js/02-glaciers.js').eachPiece;
declare const areaSeries: typeof import('../../js/02-glaciers.js').areaSeries;
declare const rankLabel: typeof import('../../js/02-glaciers.js').rankLabel;

// Names exported by js/03-imagery.js (a module), read as globals by classic scripts.
declare const prefs: typeof import('../../js/03-imagery.js').prefs;
declare const savePrefs: typeof import('../../js/03-imagery.js').savePrefs;
declare const SEASON: typeof import('../../js/03-imagery.js').SEASON;
declare const CDSE: typeof import('../../js/03-imagery.js').CDSE;
declare const LAST_DAY: typeof import('../../js/03-imagery.js').LAST_DAY;
declare const lastDay: typeof import('../../js/03-imagery.js').lastDay;
declare const ONE_ORBIT: typeof import('../../js/03-imagery.js').ONE_ORBIT;
declare const orbitFilter: typeof import('../../js/03-imagery.js').orbitFilter;
declare const SCENE_EVALSCRIPT: typeof import('../../js/03-imagery.js').SCENE_EVALSCRIPT;
declare const TRUE_COLOR: typeof import('../../js/03-imagery.js').TRUE_COLOR;
declare const STYLE_BANDS: typeof import('../../js/03-imagery.js').STYLE_BANDS;
declare const STYLE_NAME: typeof import('../../js/03-imagery.js').STYLE_NAME;
declare const isLandsat: typeof import('../../js/03-imagery.js').isLandsat;
declare const landsatName: typeof import('../../js/03-imagery.js').landsatName;
declare const LANDSAT_CREDIT: typeof import('../../js/03-imagery.js').LANDSAT_CREDIT;
declare const sensorName: typeof import('../../js/03-imagery.js').sensorName;
declare const LANDSAT_BANDS: typeof import('../../js/03-imagery.js').LANDSAT_BANDS;
declare const styleLine: typeof import('../../js/03-imagery.js').styleLine;
declare const IMAGE_COLLECTION: typeof import('../../js/03-imagery.js').IMAGE_COLLECTION;
declare const evalscriptFor: typeof import('../../js/03-imagery.js').evalscriptFor;
declare const RELAY_BASE: typeof import('../../js/03-imagery.js').RELAY_BASE;
declare const ASSETS: typeof import('../../js/03-imagery.js').ASSETS;
declare const asset: typeof import('../../js/03-imagery.js').asset;
declare const relayRoot: typeof import('../../js/03-imagery.js').relayRoot;
declare var relayCheck: typeof import('../../js/03-imagery.js').relayCheck;
declare const relayInfo: typeof import('../../js/03-imagery.js').relayInfo;
declare const LOCAL: typeof import('../../js/03-imagery.js').LOCAL;
declare const NO_RELAY: typeof import('../../js/03-imagery.js').NO_RELAY;
declare const errorText: typeof import('../../js/03-imagery.js').errorText;
declare const cdse: typeof import('../../js/03-imagery.js').cdse;
declare const memCache: typeof import('../../js/03-imagery.js').memCache;
declare const IMG_CAP: typeof import('../../js/03-imagery.js').IMG_CAP;
declare const idb: typeof import('../../js/03-imagery.js').idb;
declare const boxEntry: typeof import('../../js/03-imagery.js').boxEntry;
declare const imageFootprint: typeof import('../../js/03-imagery.js').imageFootprint;
declare const capFootprint: typeof import('../../js/03-imagery.js').capFootprint;
declare const imageBox: typeof import('../../js/03-imagery.js').imageBox;
declare const CRS3857: typeof import('../../js/03-imagery.js').CRS3857;
declare const SNOW_TIE: typeof import('../../js/03-imagery.js').SNOW_TIE;
declare const SNOW_SLACK: typeof import('../../js/03-imagery.js').SNOW_SLACK;
declare const pickScene: typeof import('../../js/03-imagery.js').pickScene;
declare const unifyOrbit: typeof import('../../js/03-imagery.js').unifyOrbit;
declare const sceneDays: typeof import('../../js/03-imagery.js').sceneDays;
declare const SCENES_FILE: typeof import('../../js/03-imagery.js').SCENES_FILE;
declare const curatedScene: typeof import('../../js/03-imagery.js').curatedScene;
declare const summerStarted: typeof import('../../js/03-imagery.js').summerStarted;
declare const landsatFiles: typeof import('../../js/03-imagery.js').landsatFiles;
declare const landsatFile: typeof import('../../js/03-imagery.js').landsatFile;
declare const landsatScene: typeof import('../../js/03-imagery.js').landsatScene;
declare const findScene: typeof import('../../js/03-imagery.js').findScene;
declare const LATEST: typeof import('../../js/03-imagery.js').LATEST;
declare var masksFile: typeof import('../../js/03-imagery.js').masksFile;
declare const MASKS: typeof import('../../js/03-imagery.js').MASKS;
declare const cloudByDay: typeof import('../../js/03-imagery.js').cloudByDay;
declare const findLatest: typeof import('../../js/03-imagery.js').findLatest;
declare const restoreLatest: typeof import('../../js/03-imagery.js').restoreLatest;
declare var latestBusy: typeof import('../../js/03-imagery.js').latestBusy;
declare const showLatest: typeof import('../../js/03-imagery.js').showLatest;
declare var pending: typeof import('../../js/03-imagery.js').pending;
declare const runQueue: typeof import('../../js/03-imagery.js').runQueue;
declare const queued: typeof import('../../js/03-imagery.js').queued;
declare const imageKey: typeof import('../../js/03-imagery.js').imageKey;
declare const footprintRes: typeof import('../../js/03-imagery.js').footprintRes;
declare const imageHere: typeof import('../../js/03-imagery.js').imageHere;
declare const smallDevice: typeof import('../../js/03-imagery.js').smallDevice;
declare const capLevel: typeof import('../../js/03-imagery.js').capLevel;
declare const loadCapImage: typeof import('../../js/03-imagery.js').loadCapImage;
declare const CAP_FINE_MPP: typeof import('../../js/03-imagery.js').CAP_FINE_MPP;
declare const capWaiting: typeof import('../../js/03-imagery.js').capWaiting;
declare const capWantsFine: typeof import('../../js/03-imagery.js').capWantsFine;
declare const capCheckFine: typeof import('../../js/03-imagery.js').capCheckFine;
declare const loadImage: typeof import('../../js/03-imagery.js').loadImage;
declare const setLoading: typeof import('../../js/03-imagery.js').setLoading;
declare const STAC_URL: typeof import('../../js/03-imagery.js').STAC_URL;
declare const stacDone: typeof import('../../js/03-imagery.js').stacDone;
declare const sceneProducts: typeof import('../../js/03-imagery.js').sceneProducts;
declare const fmtDM: typeof import('../../js/03-imagery.js').fmtDM;
declare const fmtDate: typeof import('../../js/03-imagery.js').fmtDate;

// Names exported by js/04-state.js (a module), read as globals by classic scripts.
declare var viewMode: typeof import('../../js/04-state.js').viewMode;
declare const state: typeof import('../../js/04-state.js').state;
declare var HASH_TAB: typeof import('../../js/04-state.js').HASH_TAB;
declare var OPEN_ON_GLACIER: typeof import('../../js/04-state.js').OPEN_ON_GLACIER;
declare var AUTOPLAY: typeof import('../../js/04-state.js').AUTOPLAY;
declare const HASH_AT_LOAD: typeof import('../../js/04-state.js').HASH_AT_LOAD;
declare var PLAIN_START: typeof import('../../js/04-state.js').PLAIN_START;
declare var OPEN_3D: typeof import('../../js/04-state.js').OPEN_3D;
declare var glacierPicked: typeof import('../../js/04-state.js').glacierPicked;
declare const writeHash: typeof import('../../js/04-state.js').writeHash;
declare const okYears: typeof import('../../js/04-state.js').okYears;
declare const currentGlacier: typeof import('../../js/04-state.js').currentGlacier;
