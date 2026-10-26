/**
 * Glacier outlines for any place on Earth, from GLIMS' public service (https://www.glims.org/geoserver, no login):
 *  - the Randolph Glacier Inventory 6.0, one layer per first-order region (the outline of about 2000, with the glacier's own id, name, area, length and heights),
 *  - the GLIMS glacier outlines of every date contributors have supplied (for many glaciers an old outline too: the Alps back to 1850),
 *  - the region polygons, to say which RGI region a point is in.
 * Not the best source everywhere (a national inventory is newer and better where one exists: see walkthrough/outline-sources.json), but the one that always answers.
 * RGI 7 would be newer, but its files sit behind an Earthdata login (HTTP 401, checked 26 Oct 2026), so it cannot be fetched automatically.
 */
const WFS = 'https://www.glims.org/geoserver/ows';
const R = 6378137;

/** RGI first-order regions: number -> the suffix of the GLIMS layer name (GLIMS:RGI_<suffix>). The numbering is the GTN-G one; the layer names are read from the service's capabilities. */
export const RGI_LAYERS: Record<number, string> = {
  1: 'Alaska', 2: 'WesternCanadaUS', 3: 'ArcticCanadaNorth', 4: 'ArcticCanadaSouth', 5: 'GreenlandPeriphery', 6: 'Iceland', 7: 'Svalbard', 8: 'Scandinavia', 9: 'RussianArctic', 10: 'NorthAsia',
  11: 'CentralEurope', 12: 'CaucasusMiddleEast', 13: 'CentralAsia', 14: 'SouthAsiaWest', 15: 'SouthAsiaEast', 16: 'LowLatitudes', 17: 'SouthernAndes', 18: 'NewZealand', 19: 'AntarcticSubantarctic',
};

export type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] };
export type Rgi = { rgiId: string; glimsId: string; name: string; areaKm2: number; lengthM: number | null; zmin: number; zmax: number; centre: [number, number]; date: string; region: number; geometry: Geometry };
export type Dated = { glimsId: string; name: string | null; date: string; areaKm2: number | null; by: string | null; geometry: Geometry };

const unmerc = (x: number, y: number): [number, number] => [(x / R) * (180 / Math.PI), (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)];
const mapCoords = (c: any, f: (p: number[]) => number[]): any => (typeof c[0] === 'number' ? f(c) : c.map((x: any) => mapCoords(x, f)));

async function wfs(typeName: string, params: Record<string, string>, f: typeof fetch): Promise<{ crs?: string; features: any[] }> {
  const url = `${WFS}?` + new URLSearchParams({ service: 'WFS', version: '1.0.0', request: 'GetFeature', typeName, outputFormat: 'application/json', ...params });
  const r = await f(url);
  if (!r.ok) throw new Error(`GLIMS answered ${r.status} for ${typeName}`);
  const j = (await r.json()) as { crs?: { properties?: { name?: string } }; features?: any[] };
  return { crs: j.crs?.properties?.name, features: j.features ?? [] };
}
const bboxAround = (lat: number, lon: number, km: number) => { const d = km / 111.32, dl = d / Math.cos((lat * Math.PI) / 180); return `${lon - dl},${lat - d},${lon + dl},${lat + d},EPSG:4326`; };

/** Which RGI region a point is in (null for open sea). */
export async function rgiRegionAt(lat: number, lon: number, f: typeof fetch = fetch): Promise<{ code: number; name: string } | null> {
  const { features } = await wfs('GLIMS:glims_gtng_o1regions', { maxFeatures: '5', bbox: bboxAround(lat, lon, 0.2) }, f);
  const p = features[0]?.properties;
  return p ? { code: Number(p.RGI_CODE), name: String(p.FULL_NAME) } : null;
}

/** The RGI 6.0 glaciers whose bounding box meets a square of `radiusKm` around a point, in lon/lat. */
export async function rgiNear(lat: number, lon: number, radiusKm: number, f: typeof fetch = fetch): Promise<Rgi[]> {
  const region = await rgiRegionAt(lat, lon, f);
  if (!region) return [];
  const layer = RGI_LAYERS[region.code];
  if (!layer) throw new Error(`RGI region ${region.code} (${region.name}) has no layer I know of`);
  const { crs, features } = await wfs(`GLIMS:RGI_${layer}`, { maxFeatures: '400', bbox: bboxAround(lat, lon, radiusKm) }, f);
  const merc = /3857/.test(crs ?? '');
  return features.map((x) => {
    const p = x.properties;
    return {
      rgiId: String(p.RGIID), glimsId: String(p.GLIMSID), name: String(p.NAME ?? '').trim(), areaKm2: Number(p.AREA), lengthM: p.LMAX > 0 ? Number(p.LMAX) : null, zmin: Number(p.ZMIN), zmax: Number(p.ZMAX),
      centre: [Number(p.CENLAT), Number(p.CENLON)] as [number, number], date: String(p.BGNDATE ?? ''), region: region.code,
      geometry: merc ? { type: x.geometry.type, coordinates: mapCoords(x.geometry.coordinates, ([a, b]) => unmerc(a!, b!)) } : x.geometry,
    };
  });
}

/** The year an RGI outline describes: the first four digits of its BGNDATE ("20030799" -> 2003), as the inventory states it. */
export const yearOf = (date: string) => (/^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);

/** Every dated outline GLIMS holds for one glacier (by its GLIMS id), oldest first. The same date from the same contributor is listed once. */
export async function glimsOutlines(glimsId: string, f: typeof fetch = fetch): Promise<Dated[]> {
  if (!/^G\d{6}E\d{5}[NS]$/.test(glimsId)) throw new Error(`"${glimsId}" is not a GLIMS id`);
  const { features } = await wfs('GLIMS:GLIMS_Glacier_Outlines', { maxFeatures: '200', cql_filter: `glac_id='${glimsId}'` }, f);
  const seen = new Set<string>(), out: Dated[] = [];
  for (const x of features) {
    const p = x.properties, date = String(p.src_date ?? '').slice(0, 10), key = `${date}|${p.chief_affl}`;
    if (!date || seen.has(key) || !x.geometry) continue;
    seen.add(key);
    out.push({ glimsId, name: p.glac_name ?? null, date, areaKm2: p.db_area != null ? Number(p.db_area) : null, by: p.chief_affl ?? null, geometry: x.geometry });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Glaciers by name anywhere in GLIMS (case-insensitive part of the name): one entry per glacier, with where it is. Names are looked for in the dated outlines AND in the
 * RGI layers (the two do not always agree on a name); the 19 RGI layers are asked at once.
 */
export async function findByName(name: string, f: typeof fetch = fetch): Promise<{ glimsId: string; name: string; centre: [number, number] }[]> {
  const safe = name.replace(/[^\p{L}\p{N} .-]/gu, '');
  const by = new Map<string, { glimsId: string; name: string; centre: [number, number] }>();
  const [outlines, ...rgi] = await Promise.all([
    wfs('GLIMS:GLIMS_Glacier_Outlines', { maxFeatures: '60', cql_filter: `glac_name ILIKE '%${safe}%'` }, f),
    ...Object.values(RGI_LAYERS).map((l) => wfs(`GLIMS:RGI_${l}`, { maxFeatures: '10', cql_filter: `NAME ILIKE '%${safe}%'` }, f).catch(() => ({ features: [] as any[] }))),
  ]);
  for (const x of outlines.features) {
    const id = String(x.properties.glac_id);
    if (by.has(id)) continue;
    const ring: number[][] = (x.geometry.type === 'Polygon' ? x.geometry.coordinates[0] : x.geometry.coordinates[0][0]) ?? [];
    const lon = ring.reduce((a, p) => a + p[0]!, 0) / ring.length, lat = ring.reduce((a, p) => a + p[1]!, 0) / ring.length;
    by.set(id, { glimsId: id, name: String(x.properties.glac_name), centre: [lat, lon] });
  }
  for (const l of rgi) for (const x of l.features) {
    const id = String(x.properties.GLIMSID);
    if (!by.has(id)) by.set(id, { glimsId: id, name: String(x.properties.NAME), centre: [Number(x.properties.CENLAT), Number(x.properties.CENLON)] });
  }
  return [...by.values()];
}

/** Is a point (lat, lon) inside a polygon or multipolygon (lon/lat rings)? Holes count as outside. */
export function containsPoint(g: Geometry, [lat, lon]: [number, number]): boolean {
  const inRing = (ring: number[][]) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!; if (yi! > lat !== yj! > lat && lon < ((xj! - xi!) * (lat - yi!)) / (yj! - yi!) + xi!) c = !c; } return c; };
  const poly = (rings: number[][][]) => inRing(rings[0]!) && !rings.slice(1).some(inRing);
  return g.type === 'Polygon' ? poly(g.coordinates as number[][][]) : (g.coordinates as number[][][][]).some(poly);
}
