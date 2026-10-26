/**
 * The one data contract. Every region and glacier file is validated against these schemas
 * (`npm run data`, and again by the build); a record that does not fit fails.
 *
 * Rule: nothing here has a default for a value that differs between glaciers. Such a value
 * is decided during onboarding, written into the glacier's own record, and confirmed by a
 * person (a `Confirmation`). A region never supplies defaults to its glaciers.
 */
import { z } from 'zod';

/** Addresses the site itself uses: no region or glacier may take them. */
export const RESERVED_IDS = ['onboard', 'gallery', 'api', 'data', 'assets', 'brand', 'images', 'fonts', 'sitemap', 'robots', '404'];
const slug = z.string().regex(/^[a-z0-9-]+$/).refine((v) => !RESERVED_IDS.includes(v), 'this word is used by the site itself');
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'MM-DD');
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);
/** [lat, lon] everywhere in the data files (Leaflet order). The Worker converts when it needs bbox order. */
export const LatLon = z.tuple([lat, lon]);
/** [[south, west], [north, east]] */
export const Bounds = z.tuple([LatLon, LatLon]).refine(([[s, w], [n, e]]) => s < n && w < e, 'south<north and west<east');
export type LatLon = z.infer<typeof LatLon>;
export type Bounds = z.infer<typeof Bounds>;

/** A data source; the licence always sits next to it. */
export const Source = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  url: z.string().url(),
  licence: z.string(),
  commercialUse: z.boolean().describe('false = the site must stay non-commercial because of this source'),
  /** the map layers this source serves (sources found for map layers only) */
  layers: z.array(z.string()).optional(),
  citation: z.string().optional(),
});

export type Source = z.infer<typeof Source>;

/** A person looked at the result and agreed. `basedOn` is a hash of the inputs it was confirmed on, so a changed input marks it stale. */
export const Confirmation = z.object({
  at: isoDay,
  by: z.string(),
  reason: z.string().min(3),
  basedOn: z.string().describe('hash of the inputs when confirmed (see onboard/hash.ts)'),
});
export type Confirmation = z.infer<typeof Confirmation>;

/** The period a glacier's yearly values cover, e.g. 10-01 to 09-30 in the north. */
export const BalanceYear = z.object({
  start: monthDay,
  end: monthDay,
  /** which calendar year names a period that spans two: the one it ends in (north) or the one it starts in. Decided at onboarding. */
  label: z.enum(['ends-in', 'starts-in']),
  source: z.string().describe('where these dates come from'),
});
export type BalanceYear = z.infer<typeof BalanceYear>;

/**
 * Which scenes may stand for a balance year and how the best is chosen.
 * The window is relative to the END of the balance year: a scene belongs to the year it closes.
 */
export const SceneRule = z
  .object({
    daysBeforeEnd: z.number().int().min(0).max(120),
    daysAfterEnd: z.number().int().min(0).max(60),
    maxCloud: z.number().min(0).max(1).describe('share of the picture area (cloud, shadow, cirrus) for a scene to count as clear'),
    maxCloudTongue: z.number().min(0).max(1),
    maxSnow: z.number().min(0).max(1),
    fallbackCloud: z.number().min(0).max(1).describe('if nothing is clear: the least cloudy scene up to this share'),
    minCoverage: z.literal(1).describe('a picture must cover 100 % of the picture box: not a setting, a requirement'),
    noDataMarginM: z.number().min(0).max(5000).optional().describe('the one allowance besides Landsat 7 stripes: a Landsat scene counts as covering the box when ALL its missing data lies farther than this many metres from the glacier outline. Absent or 0 = strict'),
    oneOrbit: z.boolean(),
    note: z.string().describe('why these values: what the scene statistics of this place showed'),
  })
  .refine((r) => r.daysBeforeEnd + r.daysAfterEnd < 360, 'windows of neighbouring years must not overlap');
export type SceneRule = z.infer<typeof SceneRule>;

export const SensorName = z.enum(['sentinel-2', 'landsat-1', 'landsat-2', 'landsat-3', 'landsat-4', 'landsat-5', 'landsat-7', 'landsat-8', 'landsat-9']);

/** Every map layer exists for every glacier: enabled with a provider, or off with the reason. */
export const LayerState = z.discriminatedUnion('state', [
  z.object({ state: z.literal('enabled'), provider: z.string().describe('a Source id'), others: z.array(z.string()).optional().describe('more Source ids that serve the same layer'), note: z.string().optional() }),
  z.object({ state: z.literal('unavailable'), reason: z.string().min(8) }),
]);
export const LAYERS = ['basemap', 'outlines', 'trails', 'thickness', 'radar', 'velocity', 'streetview', 'aerial', 'oldest', 'landsat', 'latest'] as const;
export type LayerId = (typeof LAYERS)[number];

export const Placement = z.object({
  tip: LatLon,
  pictureBox: Bounds,
  /** 3D strip: azimuth in degrees from tip up the glacier, half width / back / up in metres */
  strip3d: z.object({ azimuth: z.number(), half: z.number().positive(), back: z.number().min(0), up: z.number().positive() }).optional(),
  confirmation: Confirmation,
});

export const Glacier = z.object({
  id: slug,
  region: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  inventoryId: z.string(),
  /** ids this glacier had on the old site (#g=aletsch): old shared links are redirected through them */
  legacyIds: z.array(z.string()).optional(),
  rank: z.number().int().positive(),
  areaKm2: z.number().positive(),
  areaSource: z.string().describe('a Source id'),
  centre: LatLon,
  /** the base record (id, name, inventory id, rank, area, source, centre) was looked at and confirmed */
  recordConfirmation: Confirmation.optional(),
  /** Each section appears when its onboarding step has produced it. Missing = that step is still to do. */
  placement: Placement.optional(),
  balanceYear: BalanceYear.optional(),
  sceneRule: SceneRule.optional(),
  /** confirmation of balanceYear + sceneRule together */
  seasonConfirmation: Confirmation.optional(),
  sensors: z.array(SensorName).optional(),
  layers: z.partialRecord(z.enum(LAYERS), LayerState).optional(),
  layersConfirmation: Confirmation.optional(),
  elevation: z
    .object({ model: z.string(), resolutionM: z.number().positive(), yearlySurfaces: z.boolean(), reason: z.string(), confirmation: Confirmation })
    .optional(),
  stripConfirmation: Confirmation.optional(),
  credits: z.array(z.string()).optional().describe('Source ids this glacier actually uses; the Sources list is generated from it'),
});
export type Glacier = z.infer<typeof Glacier>;

export const RegionStatus = z.enum(['planned', 'onboarding', 'live']);

export const Region = z.object({
  id: slug,
  name: z.string(),
  status: RegionStatus,
  centre: LatLon,
  zoom: z.number().min(1).max(12),
  blurb: z.string(),
  unitRule: z.string().optional().describe('what counts as "a glacier" here and how the list is chosen (decided in onboarding)'),
  count: z.number().int().positive().optional(),
  confirmation: Confirmation.optional().describe('unit rule and sources were looked at and confirmed'),
  sources: z.array(Source),
  /** Sources found for the map layers of this region's glaciers. Kept apart from `sources` so that adding one never makes a confirmed step stale. */
  layerSources: z.array(Source).optional(),
});
export type Region = z.infer<typeof Region>;

/** One scene as the dashboard needs it. Landsat and Sentinel-2 share the shape. */
export const SceneRef = z.object({
  sensor: SensorName,
  date: isoDay,
  orbit: z.string().optional(),
  id: z.string().optional(),
  cloud: z.number().min(0).max(1).optional(),
  snow: z.number().min(0).max(1).optional(),
  coverage: z.number().min(0).max(1).optional(),
  /** why this picture is allowed below 100 % coverage: 'slc-off' = stripes of no data (Landsat 7 after 31 May 2003), filled along the flow; 'outside-glacier' = all missing data lies beyond the rule's margin from the glacier outline */
  gaps: z.enum(['slc-off', 'outside-glacier']).optional(),
});
export type SceneRef = z.infer<typeof SceneRef>;

/** data/regions/<region>/<glacier>/scenes.json: the scene per balance year, with the review state. */
export const ScenesFile = z.object({
  /** the scene review is complete: every year approved, pinned or marked none */
  confirmation: Confirmation.optional(),
  years: z.record(
    z.string().regex(/^\d{4}$/),
    z.object({
      chosen: SceneRef.nullable(),
      status: z.enum(['auto', 'approved', 'pinned', 'none']),
      note: z.string().optional(),
      /** discarded scenes stay listed so a re-score never returns them */
      discarded: z.array(z.string()).default([]),
    }),
  ),
});
export type ScenesFile = z.infer<typeof ScenesFile>;

/** Polygons only, and only the ones chosen as "the glacier": a candidate file can be large, the choice is small. */
const Feature = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()) }),
  properties: z.record(z.string(), z.any()).nullable().optional(),
});
export const OutlineEpoch = z.object({
  kind: z.enum(['old', 'new']),
  year: z.number().int().min(1800).max(2100).describe('the year the outline describes, as its source states it'),
  source: z.string().describe('a Source id'),
  geojson: z.object({ type: z.literal('FeatureCollection'), features: z.array(Feature).min(1) }),
});
export type OutlineEpoch = z.infer<typeof OutlineEpoch>;

/** data/regions/<region>/<glacier>/outlines.json */
export const OutlinesFile = z.object({
  epochs: z.array(OutlineEpoch).min(1),
  confirmation: Confirmation.optional(),
});
export type OutlinesFile = z.infer<typeof OutlinesFile>;
