/**
 * RGI 7.0 (NSIDC-0770, doi:10.5067/f6jmovy5navz), the glacier product (G), from a download kept by hand: put RGI2000-v7.0-G-global.zip in ~/Downloads (it needs an Earthdata login).
 * Unpacked once into .cache/rgi7 (the zip holds one zip per RGI region). Outlines are lon/lat; names are the file's `glac_name`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../data';
import { readShp } from './shapefile';
import { containsPoint, type Geometry } from './glims';

export type Rgi7 = { id: string; glimsId: string; name: string; members?: string[]; areaKm2: number; centre: [number, number]; date: string; geometry: Geometry };

const REGION_DIR: Record<number, string> = { 1: 'alaska', 2: 'western_canada_usa', 3: 'arctic_canada_north', 4: 'arctic_canada_south', 5: 'greenland_periphery', 6: 'iceland', 7: 'svalbard_jan_mayen', 8: 'scandinavia', 9: 'russian_arctic', 10: 'north_asia', 11: 'central_europe', 12: 'caucasus_middle_east', 13: 'central_asia', 14: 'south_asia_west', 15: 'south_asia_east', 16: 'low_latitudes', 17: 'southern_andes', 18: 'new_zealand', 19: 'subantarctic_antarctic_islands' };

/** Minimal CSV line split (the attribute files quote strings and have no embedded quotes or newlines in the fields used). */
const cells = (line: string) => [...line.matchAll(/"([^"]*)"|([^,]+)|(?<=,)(?=,)/g)].map((m) => m[1] ?? m[2] ?? '');

export function loadRgi7(region: number, log: (m: string) => void = () => {}, product: 'G' | 'C' = 'G'): Rgi7[] {
  const name = `RGI2000-v7.0-${product}-${String(region).padStart(2, '0')}_${REGION_DIR[region]}`, root = join(ROOT, '.cache', 'rgi7', product.toLowerCase()), dir = join(root, name);
  if (!existsSync(join(dir, `${name}.shp`))) {
    const global = join(homedir(), 'Downloads', `RGI2000-v7.0-${product}-global.zip`);
    if (!existsSync(global)) throw new Error(`RGI 7.0 is not here: download RGI2000-v7.0-${product}-global.zip (NSIDC-0770, Earthdata login) into ~/Downloads.`);
    mkdirSync(dir, { recursive: true }); log(`unpacking RGI 7.0 region ${region}`);
    execFileSync('unzip', ['-o', '-q', global, `${name}.zip`, '-d', root]); execFileSync('unzip', ['-o', '-q', join(root, `${name}.zip`), '-d', dir]);
  }
  const lines = readFileSync(join(dir, `${name}-attributes.csv`), 'utf8').trim().split('\n'), head = cells(lines[0]!), col = (n: string) => head.indexOf(n);
  const shapes = readShp(join(dir, `${name}.shp`));
  return lines.slice(1).map((l, i) => {
    const c = cells(l), sh = shapes[i];
    return { id: c[col('rgi_id')]!, glimsId: c[col('glims_id')] ?? '', name: c[col('glac_name')]!, areaKm2: Number(c[col('area_km2')]), centre: [Number(c[col('cenlat')]), Number(c[col('cenlon')])] as [number, number], date: col('src_date') >= 0 ? c[col('src_date')]!.slice(0, 10) : '', geometry: { type: 'MultiPolygon' as const, coordinates: sh ?? [] } };
  });
}

/** The RGI 7.0 glacier a point lies in, if any. */
export const rgi7At = (all: Rgi7[], at: [number, number]) => all.filter((g) => g.geometry.coordinates.length && containsPoint(g.geometry, at)).sort((a, b) => b.areaKm2 - a.areaKm2)[0] ?? null;

/** The complexes of a region (product C: glaciers that touch are one complex), each with its member glaciers' ids; the name is the largest named member's, said so by the caller. */
export function loadComplexes(region: number, log: (m: string) => void = () => {}): Rgi7[] {
  const glaciers = loadRgi7(region, log, 'G'), byId = new Map(glaciers.map((g) => [g.id, g]));
  const c = loadRgi7(region, log, 'C'), dir = join(ROOT, '.cache', 'rgi7', 'c'), base = `RGI2000-v7.0-C-${String(region).padStart(2, '0')}_${REGION_DIR[region]}`;
  const links = JSON.parse(readFileSync(join(dir, base, `${base}-CtoG_links.json`), 'utf8')) as Record<string, string[]>;
  return c.map((x) => {
    const m = (links[x.id] ?? []).map((id) => byId.get(id)).filter((g): g is Rgi7 => !!g).sort((a, b) => b.areaKm2 - a.areaKm2);
    return { ...x, members: m.map((g) => g.id), name: m.find((g) => g.name)?.name ?? '', glimsId: m[0]?.glimsId ?? '', date: m[0]?.date ?? '' };
  });
}
