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
