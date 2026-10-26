/**
 * Onboard the largest glaciers of a country from RGI 7.0 (the download kept by hand, sources/rgi7.ts), for countries where it is the newest outline set we know:
 *
 *   npm run onboard-rgi7 -- <region-id> "<country, as Natural Earth names it>" <rgi regions, e.g. 1 or 2,3,4> [count=26] [--complex] [--region-name "Name"]
 *
 * Ranked by the file's `area_km2` of glaciers whose centre lies inside the country (Natural Earth borders, downloaded once into .cache). With --complex the units are RGI's
 * glacier complexes (glaciers that touch), for ice caps and icefields; a complex is named after its largest named member, or numbered. Outlets of an ice cap do not count towards the list.
 * Older dated outlines are those GLIMS holds for the glacier (by the file's glims_id). Nothing is confirmed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, regionFile } from './data';
import { newRegion } from './engine';
import { proposeGlims } from './propose-glims';
import { writeProposal } from './proposals';
import { containsPoint, glimsOutlines, type Geometry, type Rgi } from './sources/glims';
import { loadComplexes, loadRgi7, type Rgi7 } from './sources/rgi7';
import { km } from '../shared/geo';
import type { Source } from '../shared/schema';

export const RGI7_SOURCE: Source = {
  id: 'rgi-7', name: 'Randolph Glacier Inventory 7.0 (RGI 7.0 Consortium 2023), NSIDC-0770', url: 'https://doi.org/10.5067/f6jmovy5navz',
  licence: 'NOT READ: open https://doi.org/10.5067/f6jmovy5navz and the data-use terms it links, find the licence and write it here.', commercialUse: false,
  citation: 'RGI 7.0 Consortium, 2023. Randolph Glacier Inventory - A Dataset of Global Glacier Outlines, Version 7.0. Boulder, Colorado USA. NSIDC: National Snow and Ice Data Center. doi:10.5067/f6jmovy5navz',
};

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
function border(country: string, log: (m: string) => void): Geometry {
  const f = join(ROOT, '.cache', 'natural-earth-countries.geojson');
  if (!existsSync(f)) { mkdirSync(join(ROOT, '.cache'), { recursive: true }); log('downloading the country borders (Natural Earth, public domain)'); execFileSync('curl', ['-sSL', '-m', '300', '-o', f, NE]); }
  const hit = (JSON.parse(readFileSync(f, 'utf8')) as { features: { properties: { ADMIN: string }; geometry: Geometry }[] }).features.find((x) => x.properties.ADMIN === country);
  if (!hit) throw new Error(`Natural Earth has no country "${country}".`);
  return hit.geometry;
}
const asRgi = (g: Rgi7, region: number): Rgi => ({ rgiId: g.id, glimsId: g.glimsId, name: g.name, areaKm2: g.areaKm2, lengthM: null, zmin: 0, zmax: 0, centre: g.centre, date: g.date, region, geometry: g.geometry });
const clean = (n: string) => n.replace(/^(?:(?:[A-Z]{2}\d[\w+-]*|[+-]\w+)\s+)+/, '').replace(/^[A-Z]{2}\d[\w+-]*$/, '').trim();

export async function onboardRgi7(region: string, country: string, rgiRegions: number[], count = 26, opts: { complex?: boolean; regionName?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log, b = border(country, log);
  const all = rgiRegions.flatMap((r) => (opts.complex ? loadComplexes(r, log) : loadRgi7(r, log)));
  const mine = all.filter((g) => containsPoint(b, g.centre)).sort((a, b2) => b2.areaKm2 - a.areaKm2).slice(0, count);
  if (!existsSync(regionFile(region))) {
    if (!opts.regionName) throw new Error(`Region ${region} does not exist: give --region-name.`);
    newRegion(region, opts.regionName, mine[0]!.centre);
  }
  const out: { name: string }[] = [];
  for (const [i, p] of mine.entries()) {
    const near = all.filter((q) => q.id === p.id || km(q.centre, p.centre) <= 10).map((q) => asRgi(q, rgiRegions[0]!));
    const dated = p.glimsId ? await glimsOutlines(p.glimsId).catch(() => []) : [];
    const base = clean(p.name), numbered = `RGI 7 ${p.id.replace('RGI2000-v7.0-', '')}`;
    const name = !base ? numbered : out.some((o) => o.name === base) ? `${base} (${numbered})` : base;
    const note = !base ? 'the inventory gives this glacier no name: the name is a placeholder for you to replace'
      : opts.complex ? `a glacier complex of ${p.members?.length} glaciers; the name is that of its largest named member, not a name of the whole complex` : '';
    const r = await proposeGlims(region, { g: asRgi(p, rgiRegions[0]!), near, dated }, { name, rank: i + 1, source: RGI7_SOURCE, label: opts.complex ? 'RGI 7.0 complex' : 'RGI 7.0', nameNote: note || undefined, log });
    out.push(r);
  }
  writeProposal(region, null, 'region.unit', 'onboard-rgi7', 'Largest units of this country in RGI 7.0; licence NOT READ.', {
    unitRule: `The ${count} largest ${opts.complex ? 'glacier complexes (RGI 7.0 product C: glaciers that touch)' : 'glaciers'} whose centre lies inside ${country} (Natural Earth border), by area_km2 in RGI 7.0 region${rgiRegions.length > 1 ? 's' : ''} ${rgiRegions.join(', ')}. Outlets of ice caps do not count.`, count, sources: [RGI7_SOURCE],
  });
  return out;
}

if (process.argv[1]?.endsWith('onboard-rgi7.ts')) {
  const a = process.argv.slice(2), flag = (n: string) => { const i = a.indexOf(n); if (i < 0) return undefined; const v = a[i + 1]; a.splice(i, 2); return v; }, bool = (n: string) => { const i = a.indexOf(n); if (i < 0) return false; a.splice(i, 1); return true; };
  const regionName = flag('--region-name'), complex = bool('--complex'), [region, country, regs, n] = a;
  if (!region || !country || !regs) { console.error('usage: npm run onboard-rgi7 -- <region-id> "<country>" <rgi regions> [count] [--complex] [--region-name "Name"]'); process.exit(2); }
  onboardRgi7(region, country, regs.split(',').map(Number), Number(n ?? 26), { complex, regionName }).catch((e) => { console.error((e as Error).message); process.exit(1); });
}
