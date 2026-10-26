/**
 * Proposals for a Swiss glacier from the GLAMOS inventories (SGI 2023 and SGI 1850, through their DOI pages).
 * Writes proposals for the region, the glacier record and the outline. Creates the glacier as a draft if it is new.
 * Nothing is confirmed here: the person does that in the walkthrough.
 */
import { existsSync } from 'node:fs';
import { glacierFile } from './data';
import { loadCtx, newGlacier } from './engine';
import { writeProposal } from './proposals';
import { centreOf, fetchInventory, idOf, loadInventory, locationOf, rankByArea, SGI, type SgiFeature } from './sources/glamos';
import { featuresBounds, km, simplifyRing } from './shared/geo';
import { lowestPoint } from './sources/swisstopo';

/** The citation and licence exactly as the DOI landing pages state them (read 22 Oct 2026). */
export const GLAMOS_SOURCES = [
  {
    id: 'glamos-sgi2023', name: 'GLAMOS: Swiss Glacier Inventory 2023 (release 2026)', url: SGI['2023'].landing,
    licence: 'Creative Commons Attribution 4.0 International License (CC BY 4.0)', commercialUse: true,
    citation: 'GLAMOS (2026). Swiss Glacier Inventory 2023, release 2026, Glacier Monitoring Switzerland, doi:10.18750/inventory.2023.r2026',
  },
  {
    id: 'glamos-sgi1850', name: 'GLAMOS: Swiss Glacier Inventory 1850', url: SGI['1850'].landing,
    licence: 'Creative Commons Attribution 4.0 International License (CC BY 4.0)', commercialUse: true,
    citation: 'Maisch, M., Wipf, A., Denneler, B., Battaglia, J., and Benz, C. (2000). Die Gletscher der Schweizer Alpen: Gletscherhochstand 1850, Aktuelle Vergletscherung, Gletscherschwundszenarien. Schlussbericht NFP 31. Second edition. Zurich: vdf Hochschulverlag ETH Zurich, 373 p.',
  },
];

const ascii = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** A readable address from the glacier's name: without "Grosser" and the word for glacier ("Grosser Aletschgletscher" -> "aletsch"). */
export function addressFor(name: string): string {
  const s = ascii(name).replace(/^(grosser|grosses|grosse|gross|unterer|oberer)\s+/, '').replace(/\s*(gletscher|glacier|vadret|ghiacciaio)\s*/g, ' ').trim();
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ascii(name).replace(/[^a-z0-9]+/g, '-');
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // about a metre
const mapRings = (g: SgiFeature['geometry'], f: (ring: number[][]) => number[][]) =>
  g.type === 'Polygon' ? { type: g.type, coordinates: g.coordinates.map(f) } : { type: g.type, coordinates: g.coordinates.map((p: number[][][]) => p.map(f)) };
/** The chosen glacier keeps its detail (rounded to a metre); neighbours are only there to be clicked, so they are simplified to about 10 m. */
const slim = (f: SgiFeature, e: '2023' | '1850', detailed: boolean) => ({
  type: 'Feature' as const,
  properties: e === '2023' ? { 'sgi-id': f.properties['sgi-id'], name: f.properties.name, area_km2: f.properties.area_km2, year_acq: f.properties.year_acq } : { SGI: f.properties.SGI },
  geometry: mapRings(f.geometry, (ring) => (detailed ? ring : simplifyRing(ring, 0.0001)).map(([x, y]) => [r5(x!), r5(y!)])),
});

export async function proposeGlamos(region: string, name: string, opts: { id?: string; radiusKm?: number; skipTip?: boolean; log?: (m: string) => void } = {}) {
  const log = opts.log ?? (() => {});
  const all = await loadInventory('2023', log);
  const hits = all.filter((f) => ascii(String(f.properties.name)) === ascii(name));
  const found = hits.length ? hits : all.filter((f) => ascii(String(f.properties.name)).includes(ascii(name)));
  if (found.length === 0) throw new Error(`No glacier named "${name}" in SGI 2023.`);
  if (found.length > 1) throw new Error(`"${name}" matches ${found.length} glaciers: ${found.slice(0, 8).map((f) => `${f.properties.name} (${idOf(f, '2023')}, ${Number(f.properties.area_km2).toFixed(2)} km²)`).join('; ')}. Use the full name.`);
  const f = found[0]!, inv = idOf(f, '2023');
  const dir = await fetchInventory('2023');
  const centre = locationOf(inv, dir) ?? centreOf(f);
  const id = opts.id ?? addressFor(String(f.properties.name));
  const radius = opts.radiusKm ?? 12; // km from the location point: the tongue and its neighbours, not the whole canton
  const near = (g: SgiFeature) => km(centreOf(g), centre) <= radius;
  const old = (await loadInventory('1850', log)).filter(near);
  const cur = all.filter(near);

  if (!existsSync(glacierFile(region, id))) newGlacier(region, id, String(f.properties.name), centre);
  const ctx = loadCtx(region, id);
  const by = 'propose-glamos';

  writeProposal(region, null, 'region.unit', by, 'Rule and sources as the GLAMOS DOI landing pages state them.', {
    unitRule: 'The ten largest glaciers of Switzerland by area in the Swiss Glacier Inventory 2023 (GLAMOS).', count: 10, sources: GLAMOS_SOURCES,
  });
  writeProposal(region, id, 'glacier.record', by, `From SGI 2023, glacier ${inv}: name, area_km2 and the location point are the file's own values.`, {
    id, name: String(f.properties.name), inventoryId: inv, rank: rankByArea(all, f), areaKm2: Number(f.properties.area_km2), areaSource: 'glamos-sgi2023',
    centre: [+centre[0].toFixed(5), +centre[1].toFixed(5)], legacyIds: [...new Set([id, 'sgi-' + inv])],
  });
  const pickNew = cur.map((g, i) => (idOf(g, '2023') === inv ? i : -1)).filter((i) => i >= 0);
  const pickOld = old.map((g, i) => (idOf(g, '1850') === inv ? i : -1)).filter((i) => i >= 0);
  writeProposal(region, id, 'glacier.outline', by, `Outlines of ${inv} from SGI 2023 (year_acq ${f.properties.year_acq}) and SGI 1850, matched by the inventory id. Neighbours within ${radius} km are shown so you can add or remove parts.`, {
    candidates: { new: cur.map((g) => slim(g, '2023', idOf(g, '2023') === inv)), old: old.map((g) => slim(g, '1850', idOf(g, '1850') === inv)) },
    preselect: { new: pickNew, old: pickOld },
    epochs: { new: { year: Number(f.properties.year_acq), source: 'glamos-sgi2023' }, old: { year: 1850, source: 'glamos-sgi1850' } },
  });
  // the tongue tip is the lowest point of the ice front: find it in swissALTI3D and check it against the inventory's own masl_min
  const masl = Number(f.properties.masl_min);
  let low = opts.skipTip ? null : await lowestPoint(f.geometry, fetch);
  if (low && Math.abs(low.height - masl) > 15) { log(`lowest point ${low.height} m is not the inventory's ${masl} m: sampling the outline more finely`); low = await lowestPoint(f.geometry, fetch, { coarse: 2500, refineM: 400 }); }
  const ob = featuresBounds([f])!, padLat = (ob[1][0] - ob[0][0]) * 0.15, padLon = (ob[1][1] - ob[0][1]) * 0.15;
  if (low) {
    writeProposal(region, id, 'glacier.placement', by, `Tip: the lowest point of the SGI 2023 outline by the swisstopo height service (${low.height} m, ${low.queried} heights asked). The inventory states masl_min ${masl} m (swissALTI3D 2025): ${Math.abs(low.height - masl) <= 15 ? 'they agree' : `they differ by ${(low.height - masl).toFixed(1)} m: look at the tip`}. Box: the outline plus 15 %.`, {
      tip: [+low.lat.toFixed(5), +low.lon.toFixed(5)], pictureBox: [[+(ob[0][0] - padLat).toFixed(5), +(ob[0][1] - padLon).toFixed(5)], [+(ob[1][0] + padLat).toFixed(5), +(ob[1][1] + padLon).toFixed(5)]],
    });
  }
  return { tip: low, id, inventoryId: inv, name: String(f.properties.name), areaKm2: Number(f.properties.area_km2), rank: rankByArea(all, f), centre, candidates: { new: cur.length, old: old.length }, glacierExisted: !!ctx.glacier };
}
