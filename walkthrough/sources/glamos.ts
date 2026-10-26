/**
 * GLAMOS inventories through their DOI landing pages (https://doi.glamos.ch). Downloaded once into .cache, unpacked, read,
 * and reprojected from CH1903+ / LV95 to WGS84. Nothing here is copied from another project: the files are the source.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import proj4 from 'proj4';
import { ROOT } from '../data';
import { readDbf, readShp, type Polygon } from './shapefile';
import { areaKm2 } from '../../shared/geo';

/** EPSG:2056 as the files' own .prj states it (oblique Mercator on Bessel 1841, centre 46.95240555555556 N 7.439583333333333 E), with the usual 3-parameter datum shift (good to about a metre; proj4js returns NaN for a 6-zero 7-parameter form). */
const LV95 = '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346 +units=m +no_defs';
export const toWgs84 = (x: number, y: number): [number, number] => proj4(LV95, 'WGS84', [x, y]) as [number, number];

export const SGI = {
  '2023': {
    zip: 'https://doi.glamos.ch/data/inventory/inventory_sgi2023_r2026.zip', landing: 'https://doi.glamos.ch/data/inventory/inventory_sgi2023_r2026.html',
    shp: 'SGI_2023_glaciers', idField: 'sgi-id', extra: ['SGI_2023_location'], // the ReadMe calls the points file ..._glaciers_locations; the zip has ..._location
  },
  '1850': {
    zip: 'https://doi.glamos.ch/data/inventory/inventory_sgi1850_r1992.zip', landing: 'https://doi.glamos.ch/data/inventory/inventory_sgi1850_r1992.html',
    shp: 'SGI_1850', idField: 'SGI', extra: [] as string[],
  },
} as const;
export type Epoch = keyof typeof SGI;

const cache = () => process.env.TFS_CACHE ?? join(ROOT, '.cache');

/** Downloads (once) and unpacks an inventory; returns the folder. */
export async function fetchInventory(e: Epoch, log: (m: string) => void = () => {}): Promise<string> {
  const base = join(cache(), 'glamos'), zip = join(base, `sgi${e}.zip`), dir = join(base, `sgi${e}`);
  const shp = join(dir, SGI[e].shp + '.shp'), names = [SGI[e].shp, ...SGI[e].extra];
  if (names.every((n) => existsSync(join(dir, n + '.shp')))) return dir;
  mkdirSync(dir, { recursive: true });
  if (!existsSync(zip)) {
    log(`downloading ${SGI[e].zip}`);
    // curl, not fetch: a 30 MB download over a flaky line should resume and retry, and curl does both
    execFileSync('curl', ['-fsSL', '--retry', '4', '--retry-delay', '2', '-C', '-', '-o', zip, SGI[e].zip], { stdio: 'pipe' });
  }
  // downloaded data is untrusted: unpack into our own folder only, never run anything from it
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir, ...names.map((n) => `${n}.*`)]);
  if (!existsSync(shp)) throw new Error(`${SGI[e].zip} does not contain ${SGI[e].shp}.shp`);
  return dir;
}

export type SgiFeature = {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any[] };
};

const reproject = (poly: Polygon) => poly.map((ring) => ring.map(([x, y]) => toWgs84(x, y)));

/** Every glacier of an inventory as GeoJSON in WGS84. Properties are the file's own, numbers as numbers. */
export async function loadInventory(e: Epoch, log?: (m: string) => void): Promise<SgiFeature[]> {
  const dir = await fetchInventory(e, log);
  const rows = readDbf(join(dir, SGI[e].shp + '.dbf')), shapes = readShp(join(dir, SGI[e].shp + '.shp'));
  if (rows.length !== shapes.length) throw new Error(`${SGI[e].shp}: ${rows.length} rows but ${shapes.length} shapes`);
  const out: SgiFeature[] = [];
  rows.forEach((row, i) => {
    const polys = shapes[i];
    if (!polys?.length) return;
    const props: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(row)) props[k] = v !== '' && /^-?\d+(\.\d+)?$/.test(v) && k !== SGI[e].idField ? Number(v) : v;
    const rp = polys.map(reproject);
    out.push({ type: 'Feature', properties: props, geometry: rp.length === 1 ? { type: 'Polygon', coordinates: rp[0]! } : { type: 'MultiPolygon', coordinates: rp } });
  });
  return out;
}

export const idOf = (f: SgiFeature, e: Epoch) => String(f.properties[SGI[e].idField] ?? '');

/** Centre of a feature's bounding box, [lat, lon]. */
export function centreOf(f: SgiFeature): [number, number] {
  let s = 90, w = 180, n = -90, ea = -180;
  const walk = (c: any): void => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); ea = Math.max(ea, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
  walk(f.geometry.coordinates);
  return [(s + n) / 2, (w + ea) / 2];
}

export const featureAreaKm2 = (f: SgiFeature) => areaKm2(f.geometry);

/** Where the file's own location point of a glacier is (SGI 2023 has them, chosen by hand for labels): [lat, lon]. */
export function locationOf(id: string, dir: string): [number, number] | null {
  const base = join(dir, 'SGI_2023_location');
  if (!existsSync(base + '.dbf')) return null;
  const rows = readDbf(base + '.dbf'), i = rows.findIndex((r) => r['sgi-id'] === id);
  if (i < 0) return null;
  const x = Number(rows[i]!['xcoor']), y = Number(rows[i]!['ycoor']);
  return Number.isFinite(x) && Number.isFinite(y) ? toWgs84(x, y).reverse() as [number, number] : null;
}

/** Rank by area among all glaciers of the 2023 inventory (1 = largest), from the file's own area_km2. */
export const rankByArea = (all: SgiFeature[], f: SgiFeature) => 1 + all.filter((g) => Number(g.properties.area_km2) > Number(f.properties.area_km2)).length;

export const readText = (p: string) => readFileSync(p, 'utf8');
