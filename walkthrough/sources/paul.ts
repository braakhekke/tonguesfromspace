/**
 * The glacier inventory of the Alps from Sentinel-2 (Paul et al. 2019, outlines 2015, some 2016; Austria, France, Italy, Switzerland), PANGAEA doi:10.1594/PANGAEA.909133.
 * Downloaded once into .cache, read, and reprojected from UTM 32N (the file's own .prj) to WGS84. The file has area, centre and country per glacier, and no names.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import proj4 from 'proj4';
import { ROOT } from '../data';
import { readDbf, readShp } from './shapefile';
import type { Geometry } from './glims';
import type { Source } from '../../shared/schema';

export const PAUL_URL = 'https://store.pangaea.de/Publications/PaulF-etal_2019/c3s_gi_rgi11_s2_2015_v2.zip';
const UTM32 = '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs';

/** Licence and citation as the PANGAEA page states them (read 26 Oct 2026); confirming it is the owner's. */
export const PAUL_SOURCE: Source = {
  id: 'paul-alps-2015', name: 'Glacier inventory of the Alps from Sentinel-2 (Paul et al. 2019), outlines 2015', url: 'https://doi.org/10.1594/PANGAEA.909133',
  licence: 'Creative Commons Attribution 4.0 International (CC-BY-4.0), as the PANGAEA record states; read 26 Oct 2026, to be confirmed by the owner', commercialUse: true,
  citation: 'Paul, F., Rastner, P., Azzoni, R. S., Diolaiuti, G., Fugazza, D., Le Bris, R., Nemec, J., Rabatel, A., Ramusovic, M., Schwaizer, G., Smiraglia, C. (2019): Glacier inventory of the Alps from Sentinel-2, shape files. PANGAEA, https://doi.org/10.1594/PANGAEA.909133',
};

export type PaulGlacier = { nr: string; country: string; areaKm2: number; centre: [number, number]; date: string; geometry: Geometry };

let cached: PaulGlacier[] | null = null;
export function loadPaul(log: (m: string) => void = () => {}): PaulGlacier[] {
  if (cached) return cached;
  const dir = join(ROOT, '.cache', 'paul-alps-2015'), base = join(dir, 'c3s_gi_rgi11_s2_2015_v2', 'c3s_gi_rgi11_s2_2015_v2');
  if (!existsSync(base + '.shp')) {
    mkdirSync(dir, { recursive: true }); log('downloading the Alps inventory from PANGAEA (7.5 MB)');
    execFileSync('curl', ['-sSL', '-m', '300', '-o', join(dir, 'p.zip'), PAUL_URL]);
    execFileSync('unzip', ['-o', '-q', join(dir, 'p.zip'), '-d', dir]);
  }
  const rows = readDbf(base + '.dbf'), shapes = readShp(base + '.shp');
  const ll = ([x, y]: [number, number]) => { const [lo, la] = proj4(UTM32, 'WGS84', [x, y]) as [number, number]; return [lo, la]; };
  cached = rows.map((r, i) => ({ r, sh: shapes[i] })).filter((x) => x.sh).map(({ r, sh }) => ({
    nr: r.GLACIER_NR!, country: r.Country!, areaKm2: Number(r.AREA_KM2), centre: [Number(r.LAT), Number(r.LON)] as [number, number], date: r.Date!,
    geometry: { type: 'MultiPolygon' as const, coordinates: sh!.map((poly) => poly.map((ring) => ring.map(ll))) },
  }));
  return cached;
}
