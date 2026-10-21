// Names the page's scripts use that are not declared in them. Checked by `tsc -p jsconfig.json` (see jsconfig.json).
declare const turnstile: any;      // Cloudflare Turnstile widget, loaded on demand from challenges.cloudflare.com

interface Window {
  GLACIER_DATA: any;          // glaciers.js (made by scripts/build_outlines.py)
  GLACIER_OUTLINES: any;      // the 2023 outline files of the public site (scripts/build_site.py)
  REGION_ICE: any;            // the data file of an ice-cap region (scripts/build_vatnajokull.py, scripts/build_regions.py)
  GLACIER_TRAILS: any;        // trails-is.js (scripts/build_trails_iceland.py)
  GLACIER_SIGHT: any;         // sightline.js (scripts/build_sightline.py)
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
