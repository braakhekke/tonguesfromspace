/**
 * Reading the site's own data files (data/*.js, data/*.json) from the tooling. The data files that the build scripts make from the inventories
 * (data/glaciers.js, iceland.js, ...) are NOT copied into the records: a record points at the outline in the file (`ref`), and this resolves it.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './data';
import type { OutlinesFile } from './shared/schema';

const cache = new Map<string, { m: number; value: any }>();

/** `window.X` of a data file such as data/glaciers.js, evaluated in an empty context (the files are plain `window.X = {...}`). */
export function siteScript(file: string): Record<string, any> {
  const p = join(process.env.TFS_SITE ?? ROOT, file);
  if (!existsSync(p)) throw new Error(`${file} is missing`);
  const m = statSync(p).mtimeMs, hit = cache.get(p);
  if (hit && hit.m === m) return hit.value;
  const w: Record<string, any> = {};
  vm.runInNewContext(readFileSync(p, 'utf8'), { window: w });
  cache.set(p, { m, value: w });
  return w;
}
export const siteJson = (file: string) => JSON.parse(readFileSync(join(process.env.TFS_SITE ?? ROOT, file), 'utf8'));
export const siteFileExists = (file: string) => existsSync(join(process.env.TFS_SITE ?? ROOT, file));

/** The entry of one glacier in a region data file: Swiss glaciers are `glaciers[]` of data/glaciers.js, the others `outlets[]` of a REGION_ICE file. */
export function siteEntry(file: string, id: string): any {
  const w = siteScript(file);
  const list: any[] = w.GLACIER_DATA ? w.GLACIER_DATA.glaciers : w.REGION_ICE ? w.REGION_ICE.outlets : [];
  const e = list.find((g) => g.id === id);
  if (!e) throw new Error(`${id} is not in ${file}`);
  return e;
}

const at = (o: any, path: string) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);

/** A referenced outline as GeoJSON features (lon, lat). The Met Office outlines are open lines in [lat, lon] pairs; the inventories are GeoJSON geometries already. */
export function resolveRef(ref: { file: string; id: string; field: string }) {
  const v = at(siteEntry(ref.file, ref.id), ref.field);
  if (!v) throw new Error(`${ref.file}: ${ref.id} has no ${ref.field}`);
  const geometry = v.lines ? { type: 'MultiLineString', coordinates: v.lines.map((l: number[][]) => l.map(([la, lo]) => [lo, la])) } : v.type ? v : null;
  if (!geometry) throw new Error(`${ref.file}: ${ref.id}.${ref.field} is not an outline I can read`);
  return { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: null, geometry }] };
}

/** What the wizard draws: every epoch with its geometry, whether the record holds it or points at it. The files on disk keep the reference. */
export const resolveOutlines = (o: OutlinesFile): OutlinesFile => ({ ...o, epochs: o.epochs.map((e) => (e.ref && !e.geojson ? { ...e, geojson: resolveRef(e.ref) } : e)) });
