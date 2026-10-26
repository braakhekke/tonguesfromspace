/**
 * Onboard the largest glaciers of one Alpine country from the 2015 Sentinel-2 inventory (sources/paul.ts), the newest outlines there are:
 *
 *   npm run onboard-paul -- <region-id> <AT|FR|IT> [count=26]
 *
 * The record, the outline and its neighbours (other glaciers of that inventory within 10 km) come from the inventory. The inventory has no names: a glacier gets the name
 * of the RGI 7.0 glacier its centre lies in, if that has one (the RGI 7.0 download in ~/Downloads, sources/rgi7.ts) (said in the note), else "Alps 2015 no. N". Older dated outlines are those GLIMS holds for that RGI glacier.
 * Nothing is confirmed.
 */
import { existsSync } from 'node:fs';
import { regionFile } from './data';
import { newRegion } from './engine';
import { proposeGlims } from './propose-glims';
import { pick } from './propose-glims';
import { glimsOutlines, rgiNear, type Rgi } from './sources/glims';
import { loadRgi7, rgi7At } from './sources/rgi7';
import { loadPaul, PAUL_SOURCE, type PaulGlacier } from './sources/paul';
import { km, MAX_PER_REGION, MIN_ONBOARD_KM2 } from '../shared/geo';
import { writeProposal } from './proposals';

const asRgi = (p: PaulGlacier): Rgi => ({ rgiId: `paul-${p.nr}`, glimsId: '', name: '', areaKm2: p.areaKm2, lengthM: null, zmin: 0, zmax: 0, centre: p.centre, date: p.date, region: 11, geometry: p.geometry });

export async function onboardPaul(region: string, country: string, count = 26, opts: { regionName?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const all = loadPaul(log), mine = all.filter((g) => g.country === country && g.areaKm2 >= MIN_ONBOARD_KM2).sort((a, b) => b.areaKm2 - a.areaKm2).slice(0, Math.min(count, MAX_PER_REGION));
  if (!existsSync(regionFile(region))) {
    if (!opts.regionName) throw new Error(`Region ${region} does not exist: give --region-name.`);
    newRegion(region, opts.regionName, mine[0]!.centre);
  }
  const names7 = loadRgi7(11, log), out = [];
  for (const [i, p] of mine.entries()) {
    const near = all.filter((q) => q.nr === p.nr || km(q.centre, p.centre) <= 10).map(asRgi);
    const rgi = await rgiNear(p.centre[0], p.centre[1], 3).then((n) => pick(n, p.centre)).catch(() => null);
    const dated = rgi ? await glimsOutlines(rgi.glimsId).catch(() => []) : [];
    const r7 = rgi7At(names7, p.centre), named = r7?.name.replace(/^(?:(?:[A-Z]{2}\d[\w+-]*|[+-]\w+)\s+)+/, '').replace(/^[A-Z]{2}\d[\w+-]*$/, '').trim();
    const g = { ...asRgi(p), name: '' };
    const taken = out.some((o) => o.name === named), name = !named ? `Alps 2015 no. ${p.nr}` : taken ? `${named} (Alps 2015 no. ${p.nr})` : named;      // two inventory glaciers can lie in one RGI 7.0 glacier: the second gets its number, or it would overwrite the first
    const r = await proposeGlims(region, { g, near, dated }, {
      name, rank: i + 1, source: PAUL_SOURCE, label: 'Alps 2015 (Paul et al.)', log,
      nameNote: named ? `the inventory has no names; the name is that of the RGI 7.0 glacier ${r7!.id} the centre lies in` : 'the inventory has no names, and no RGI 7.0 glacier of this place has one: the name is a placeholder for you to replace',
    });
    out.push(r);
  }
  writeProposal(region, null, 'region.unit', 'onboard-paul', 'The largest glaciers of this country by area in the Sentinel-2 inventory of the Alps (2015); licence as the PANGAEA page states, to be confirmed.', {
    unitRule: `The ${count} largest glaciers of the country (field Country = ${country}) by AREA_KM2 in the Alps inventory from Sentinel-2 (Paul et al. 2019, outlines 2015). Outlets of ice caps do not count.`, count, sources: [PAUL_SOURCE],
  });
  return out;
}

if (process.argv[1]?.endsWith('onboard-paul.ts')) {
  const [region, country, n] = process.argv.slice(2).filter((x: string) => !x.startsWith('--')), rn = process.argv.indexOf('--region-name');
  if (!region || !country) { console.error('usage: npm run onboard-paul -- <region-id> <AT|FR|IT> [count] [--region-name "Name"]'); process.exit(2); }
  onboardPaul(region, country, Number(n ?? 26), { regionName: rn > 0 ? process.argv[rn + 1] : undefined }).catch((e) => { console.error((e as Error).message); process.exit(1); });
}
