/**
 * Everything that is sent to Copernicus Data Space is built HERE, from a glacier record.
 * The browser never sends a Copernicus request body; it sends meaning (glacier, date, style, tile)
 * and the Worker builds the body. So the relay needs no "is this request safe?" checks, and
 * the cache key is derived from the evalscripts below: change a script and every key changes.
 *
 * Rendering = the Copernicus Browser "true colour" process on Sentinel-2 L1C (top of atmosphere;
 * L2A fills in shaded slopes, which looks unnatural in mountains). Scoring uses L2A scene classes
 * (SCL: 3 shadow, 8/9 cloud, 10 cirrus, 11 snow or ice).
 */
import type { Tile } from './geo';

export const STYLES = ['natural', 'false1', 'false2'] as const;
export type Style = (typeof STYLES)[number];
export const STYLE_BANDS: Record<Style, [string, string, string]> = {
  natural: ['B04', 'B03', 'B02'],
  false1: ['B08', 'B04', 'B03'], // infrared
  false2: ['B8A', 'B11', 'B12'], // snow in red
};
export const STYLE_LABEL: Record<Style, string> = { natural: 'Natural', false1: 'False 1 (infrared)', false2: 'False 2 (snow in red)' };

const RENDER = { maxR: 3, midR: 0.13, sat: 1.3, gamma: 2.3, gOff: 0.01 };
const RAYLEIGH: Record<string, number> = { B04: 0.013, B03: 0.024, B02: 0.041, B08: 0, B8A: 0, B11: 0, B12: 0 };

export const L1C = 'sentinel-2-l1c';
export const L2A = 'sentinel-2-l2a';

const orbitFilter = (orbit?: string) =>
  orbit
    ? `function preProcessScenes(c){ c.scenes.tiles = c.scenes.tiles.filter(function(x){ return JSON.stringify(x).indexOf("_${orbit}_") >= 0; }); return c; }`
    : `function preProcessScenes(c){ var t = c.scenes.tiles, m = t.length > 1 ? /_R\\d{3}_/.exec(JSON.stringify(t[0])) : null; if (m) c.scenes.tiles = t.filter(function(x){ return JSON.stringify(x).indexOf(m[0]) >= 0; }); return c; }`;

export function imageEvalscript(style: Style, orbit?: string): string {
  const [r, g, b] = STYLE_BANDS[style];
  const T = RENDER;
  return `//VERSION=3
var maxR = ${T.maxR}, midR = ${T.midR}, sat = ${T.sat}, gamma = ${T.gamma}, gOff = ${T.gOff};
var gOffPow = Math.pow(gOff, gamma), gOffRange = Math.pow(1 + gOff, gamma) - gOffPow;
function setup(){ return { input:["${r}","${g}","${b}","dataMask"], mosaicking:"TILE", output:{ bands:3 } }; }
${orbitFilter(orbit)}
function clip(s){ return s < 0 ? 0 : s > 1 ? 1 : s; }
function adj(a, tx, ty, maxC){ var ar = clip(a / maxC); return ar * (ar * (tx / maxC + ty - 1) - ty) / (ar * (2 * tx / maxC - 1) - tx / maxC); }
function adjGamma(b){ return (Math.pow(b + gOff, gamma) - gOffPow) / gOffRange; }
function sAdj(a){ return adjGamma(adj(a, midR, 1, maxR)); }
function sRGB(c){ return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 0.41666666666) - 0.055; }
function evaluatePixel(ss){
  var p = ss[0] || { dataMask:0 }; for (var i = 0; i < ss.length; i++) if (ss[i].dataMask == 1) { p = ss[i]; break; }
  if (!p.dataMask) return [0.11, 0.16, 0.19];
  var lr = sAdj(p.${r} - ${RAYLEIGH[r]}), lg = sAdj(p.${g} - ${RAYLEIGH[g]}), lb = sAdj(p.${b} - ${RAYLEIGH[b]});
  var avg = (lr + lg + lb) / 3 * (1 - sat);
  return [sRGB(clip(avg + lr * sat)), sRGB(clip(avg + lg * sat)), sRGB(clip(avg + lb * sat))];
}`;
}

/** Per day and orbit (two slots, A and B): cloud/shadow/cirrus share, snow share, valid share, orbit number. */
export const SCENE_EVALSCRIPT = `//VERSION=3
function setup(){ return { input:[{ bands:["SCL","dataMask"] }], mosaicking:"TILE",
  output:[{ id:"cloudA", bands:1, sampleType:"FLOAT32" }, { id:"snowA", bands:1, sampleType:"FLOAT32" }, { id:"validA", bands:1, sampleType:"FLOAT32" }, { id:"orbA", bands:1, sampleType:"FLOAT32" },
          { id:"cloudB", bands:1, sampleType:"FLOAT32" }, { id:"snowB", bands:1, sampleType:"FLOAT32" }, { id:"validB", bands:1, sampleType:"FLOAT32" }, { id:"orbB", bands:1, sampleType:"FLOAT32" }, { id:"dataMask", bands:1 }] }; }
var ORB = [], OA = 0, OB = 0;
function preProcessScenes(c){ ORB = c.scenes.tiles.map(function(t){ var m = /_R(\\d{3})_/.exec(JSON.stringify(t)); return m ? +m[1] : 0; }); OA = ORB[0] || 0; OB = 0; for (var i = 1; i < ORB.length; i++) if (ORB[i] && ORB[i] !== OA) { OB = ORB[i]; break; } return c; }
function evaluatePixel(ss){
  var a = { c:0, s:0, v:0 }, b = { c:0, s:0, v:0 };
  for (var i = 0; i < ss.length; i++) { var x = ss[i]; if (x.dataMask != 1 || x.SCL == 0) continue; var t = ORB[i] === OA ? a : ORB[i] === OB ? b : null;
    if (t && !t.v) { t.v = 1; t.c = (x.SCL == 3 || x.SCL == 8 || x.SCL == 9 || x.SCL == 10) ? 1 : 0; t.s = x.SCL == 11 ? 1 : 0; } }
  return { cloudA:[a.c], snowA:[a.s], validA:[a.v], orbA:[OA], cloudB:[b.c], snowB:[b.s], validB:[b.v], orbB:[OB], dataMask:[1] };
}`;

/** The Process API body for one tile of one chosen day. */
export function processBody(tile: Tile, date: string, style: Style, orbit: string | undefined, format: 'image/jpeg' | 'image/png' = 'image/jpeg') {
  return {
    input: {
      bounds: { bbox: tile.bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/3857' } },
      data: [
        {
          type: L1C,
          dataFilter: { timeRange: { from: `${date}T00:00:00Z`, to: `${date}T23:59:59Z` }, mosaickingOrder: 'leastCC' },
          processing: { upsampling: 'BILINEAR' }, // smooth 20 m and 60 m bands
        },
      ],
    },
    output: { width: tile.w, height: tile.h, responses: [{ identifier: 'default', format: { type: format } }] },
    evalscript: imageEvalscript(style, orbit),
  };
}

/** Scoring resolution in projection metres: cheap, plenty for cloud cover. */
export const STATS_RES_M = 60;

/** The Statistical API body: all scenes between two days (inclusive) over the picture box, per day and orbit. */
export function statisticsBody(bbox: Tile['bbox'], from: string, to: string, mercatorRes: number) {
  const next = new Date(Date.parse(`${to}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  return {
    input: {
      bounds: { bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/3857' } },
      data: [{ type: L2A, dataFilter: { mosaickingOrder: 'leastCC' } }],
    },
    aggregation: {
      timeRange: { from: `${from}T00:00:00Z`, to: `${next}T00:00:00Z` },
      aggregationInterval: { of: 'P1D' },
      evalscript: SCENE_EVALSCRIPT,
      resx: mercatorRes,
      resy: mercatorRes,
    },
  };
}

export type Candidate = { date: string; orbit: string; cloud: number; snow: number; coverage: number };

/** Turn the Statistical API answer into candidates (up to two per day, one per orbit). */
export function parseStatistics(j: any): Candidate[] {
  const out: Candidate[] = [];
  for (const d of j?.data ?? []) {
    try {
      const o = d.outputs, m = (k: string) => o[k].bands.B0.stats.mean as number, date = String(d.interval.from).slice(0, 10);
      for (const k of ['A', 'B']) {
        const valid = m('valid' + k), orb = Math.round(m('orb' + k));
        if (valid > 0 && orb) out.push({ date, orbit: 'R' + String(orb).padStart(3, '0'), cloud: m('cloud' + k) / valid, snow: m('snow' + k) / valid, coverage: valid });
      }
    } catch { /* a day without usable statistics */ }
  }
  return out.filter((c) => Number.isFinite(c.cloud) && Number.isFinite(c.snow));
}

/** Cache identity of the rendering: any change to the scripts changes every image key. */
export const RENDER_FINGERPRINT_SOURCE = [imageEvalscript('natural'), imageEvalscript('false1'), imageEvalscript('false2'), SCENE_EVALSCRIPT].join('\n');
