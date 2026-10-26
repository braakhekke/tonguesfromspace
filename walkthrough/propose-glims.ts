/**
 * Proposals for a glacier anywhere, from GLIMS' public outlines (sources/glims.ts): the record, the outline (the RGI 6.0 outline of about 2000, and the oldest dated outline GLIMS has
 * for the same glacier), the tongue tip and picture box, the map layers, and the season as it is in the closest region already set up.
 * Nothing is confirmed here and nothing is guessed silently: what is a first guess says so in its note (the tip is the southernmost point of the outline until a height model
 * has found the lowest point), and what cannot be known (the licence of a source, the rule of a region, where a balance year's dates come from) is marked for a person.
 */
import { existsSync } from 'node:fs';
import { glacierFile, loadAll } from './data';
import { loadCtx, newGlacier } from './engine';
import { writeProposal } from './proposals';
import { addressFor } from './propose-glamos';
import { containsPoint, glimsOutlines, rgiNear, yearOf, type Dated, type Rgi } from './sources/glims';
import { featuresBounds, km, simplifyRing, southernmost } from '../shared/geo';
import type { Bounds, LatLon, Source } from '../shared/schema';

export const RGI_SOURCE: Source = {
  id: 'rgi-6', name: 'Randolph Glacier Inventory 6.0 (RGI Consortium 2017), via GLIMS', url: 'https://www.glims.org/RGI/',
  licence: 'NOT READ: open https://www.glims.org/RGI/ and the data-use terms it links, find the licence and write it here.', commercialUse: false,
  citation: 'Randolph Glacier Inventory 6.0 (RGI Consortium 2017), via GLIMS',
};
export const GLIMS_SOURCE: Source = {
  id: 'glims', name: 'GLIMS Glacier Database: glacier outlines of many dates', url: 'https://www.glims.org/',
  licence: 'NOT READ: open https://www.glims.org/ and its data-use terms, find the licence and write it here.', commercialUse: false,
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // about a metre
const slim = (g: Rgi['geometry'], detailed: boolean) => {
  const f = (ring: number[][]) => (detailed ? ring : simplifyRing(ring, 0.0001)).map(([x, y]) => [r5(x!), r5(y!)]);
  return g.type === 'Polygon' ? { type: g.type, coordinates: (g.coordinates as number[][][]).map(f) } : { type: g.type, coordinates: (g.coordinates as number[][][][]).map((p) => p.map(f)) };
};

/** The RGI glacier a point means: the one it lies in, else the nearest centre (a click on a moraine is a click beside the glacier). */
export function pick(near: Rgi[], at: LatLon): Rgi | null {
  const inside = near.filter((g) => containsPoint(g.geometry, at)).sort((a, b) => b.areaKm2 - a.areaKm2);
  if (inside[0]) return inside[0];
  return [...near].sort((a, b) => km(a.centre, at) - km(b.centre, at))[0] ?? null;
}

export type Proposed = { id: string; name: string; rgiId: string; glimsId: string; areaKm2: number; centre: LatLon; older: Dated | null; box: Bounds; tip: LatLon; seasonFrom: string | null };

/** What GLIMS knows about the glacier at a point: the picks, before anything is written (so a group can be ranked by area first). */
export async function lookUp(at: LatLon, name: string | undefined, f: typeof fetch = fetch, radiusKm = 10): Promise<{ g: Rgi; near: Rgi[]; dated: Dated[] }> {
  const near = await rgiNear(at[0], at[1], radiusKm, f);
  const g = pick(near, at);
  if (!g) throw new Error(`GLIMS has no RGI glacier within ${radiusKm} km of ${at[0]}, ${at[1]}.`);
  const dated = await glimsOutlines(g.glimsId, f).catch(() => []);
  void name;
  return { g, near, dated };
}

export async function proposeGlims(region: string, found: { g: Rgi; near: Rgi[]; dated: Dated[] }, opts: { name?: string; id?: string; rank: number; source?: Source; label?: string; nameNote?: string; regionRule?: string; log?: (m: string) => void }) {
  const log = opts.log ?? (() => {});
  const { g, near, dated } = found;
  const name = opts.name || g.name || `RGI ${g.rgiId}`;
  const id = opts.id ?? addressFor(name);
  if (!existsSync(glacierFile(region, id))) newGlacier(region, id, name, g.centre);
  const c = loadCtx(region, id);
  const by = 'propose-glims', src = opts.source ?? RGI_SOURCE, label = opts.label ?? 'RGI 6.0';

  // outlines: the RGI one is "new" (about 2000); the oldest GLIMS date is "old" if it is clearly older
  const year = yearOf(g.date);
  const newest = dated[dated.length - 1] ?? null, oldest = dated[0] ?? null, older = oldest && year !== null && Number(oldest.date.slice(0, 4)) < year - 10 ? oldest : null;
  const feat = (x: Rgi) => ({ type: 'Feature' as const, properties: { 'rgi-id': x.rgiId, name: x.name, area_km2: x.areaKm2, year: yearOf(x.date) }, geometry: slim(x.geometry, x.rgiId === g.rgiId) });
  const datedFeats = dated.map((d) => ({ type: 'Feature' as const, properties: { date: d.date, by: d.by, area_km2: d.areaKm2 }, geometry: slim(d.geometry as Rgi['geometry'], false) }));
  const oldIdx = older ? dated.findIndex((d) => d.date === older.date && d.by === older.by) : -1;
  writeProposal(region, id, 'glacier.outline', by, `${label} outline of ${g.rgiId} (outline date ${g.date || 'not stated'}), ${near.length} glaciers within 10 km shown so you can add parts that belong to this one. GLIMS holds ${dated.length} dated outline${dated.length === 1 ? '' : 's'} of this glacier${dated.length ? ` (${dated[0]!.date.slice(0, 4)} to ${dated[dated.length - 1]!.date.slice(0, 4)})`: ''}${newest && year !== null && Number(newest.date.slice(0, 4)) > year + 3 ? `; THE NEWEST (${newest.date}, ${newest.by ?? 'contributor not stated'}, ${newest.areaKm2 ?? 'area not stated'} km² against ${g.areaKm2} km² here) IS NEWER THAN THE ${label} ONE: look at it, it may be the better present outline, or only part of the glacier` : ''}: all are listed to choose from${older ? `; the oldest (${older.date}, ${older.by ?? 'contributor not stated'}) is proposed as the past outline` : '; none is clearly older than the RGI one, so no past outline is proposed'}.`, {
    candidates: { new: near.map(feat), old: older ? [datedFeats[oldIdx]!] : [] },
    dated: datedFeats,      // every dated outline GLIMS has, oldest first: the screen lists them all, any number can be kept
    preselect: { new: near.map((x, i) => (x.rgiId === g.rgiId ? i : -1)).filter((i) => i >= 0), old: older ? [0] : [] },
    epochs: { new: { year: year ?? 2000, source: src.id }, ...(older ? { old: { year: Number(older.date.slice(0, 4)), source: GLIMS_SOURCE.id, date: older.date, datedIndex: oldIdx } } : {}) },
  });

  writeProposal(region, id, 'glacier.record', by, `From the ${label} record ${g.rgiId}: area (${g.areaKm2} km²) and centre are the inventory's own values${opts.nameNote ? `; ${opts.nameNote}` : `, and so is the name${g.name ? '' : '; the inventory gives this glacier no name, the name is the one you asked for'}`}.`, {
    id, name, inventoryId: g.rgiId, rank: opts.rank, areaKm2: g.areaKm2, areaSource: RGI_SOURCE.id, centre: [+g.centre[0].toFixed(5), +g.centre[1].toFixed(5)], legacyIds: [],
  });

  // the picture box: the outline plus 15 %; the tip: the southernmost point is only a first guess
  const ob = featuresBounds([{ geometry: g.geometry }])!, padLat = (ob[1][0] - ob[0][0]) * 0.15, padLon = (ob[1][1] - ob[0][1]) * 0.15;
  const box: Bounds = [[+(ob[0][0] - padLat).toFixed(5), +(ob[0][1] - padLon).toFixed(5)], [+(ob[1][0] + padLat).toFixed(5), +(ob[1][1] + padLon).toFixed(5)]];
  const south = southernmost([{ geometry: g.geometry }]) ?? g.centre, tip: LatLon = [+south[0].toFixed(5), +south[1].toFixed(5)];
  writeProposal(region, id, 'glacier.placement', by, 'Box: the outline plus 15 % each way. Tip: the SOUTHERNMOST point of the outline, a first guess only (the real tip is the LOWEST point of the ice front, and on a glacier that flows north it is elsewhere): drag it onto the lowest point of the tongue.', { tip, pictureBox: box });

  // the season: the closest region already set up, said as such
  const others = loadAll().regions.flatMap((r) => r.glaciers.map((x) => x.glacier)).filter((x) => x.id !== id && x.balanceYear && x.sceneRule && x.placement);
  const near1 = others.map((x) => ({ x, d: km(x.centre, g.centre) })).sort((a, b) => a.d - b.d)[0];
  if (near1) writeProposal(region, id, 'glacier.season', by, `COPIED from ${near1.x.name} (${Math.round(near1.d)} km away, ${near1.x.region}) as a starting point, not worked out for this place: its balance-year dates and scene rule. Check them against where this glacier's yearly figures come from and the scene statistics of this place.`, {
    balanceYear: { ...near1.x.balanceYear, source: `NOT SET for ${name}: say where this glacier's balance-year dates come from.` }, sceneRule: near1.x.sceneRule,
  });

  writeProposal(region, null, 'region.unit', by, 'Sources found for the outlines. Licences are NOT READ: open each page and write the licence into the source. The unit rule is a placeholder.', {
    unitRule: c.region.unitRule ?? opts.regionRule ?? 'TO WRITE: what counts as "a glacier" in this region, as a rule someone else could apply and get the same list.',
    sources: [...(c.region.sources.length ? c.region.sources : []), ...[src, GLIMS_SOURCE].filter((s) => !c.region.sources.some((x) => x.id === s.id))],
  });
  log(`${name}: ${g.rgiId}, ${g.areaKm2} km², ${near.length} near, ${dated.length} dated outlines`);
  return { id, name, rgiId: g.rgiId, glimsId: g.glimsId, areaKm2: g.areaKm2, centre: g.centre, older, box, tip, seasonFrom: near1?.x.name ?? null } satisfies Proposed;
}
