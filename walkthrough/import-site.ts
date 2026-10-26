/**
 * Fill the walkthrough's records from what the site already has: `npm run walkthrough -- import-site`.
 *
 * Reads js/regions.js, data/boxes.js, data/scenes.json, data/landsat/*.json and the region data files (data/glaciers.js, iceland.js, ...)
 * and writes, per region and glacier, the records of data/regions/ (region.json, glacier.json, scenes.json, outlines.json).
 *
 *  - Nothing is confirmed: a record carries `imported` and no confirmation, so the walkthrough shows every step as "proposed" until a person
 *    has looked at it and confirmed it. The site is generated from the records (export.ts), imported ones included, so nothing changes for visitors meanwhile.
 *  - Outlines are not copied: the build scripts make them from the inventories (and the monthly Action refreshes them). A record points at them (`ref`).
 *  - Where the site's rule cannot be said in the walkthrough's terms (a target day, a window that ends before the balance year), the difference is
 *    written into the rule's note instead of being dropped.
 *  - A record that a person has confirmed is never overwritten.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT, dataRoot, glacierFile, outlinesFile, regionFile, scenesFile, writeJson } from './data';
import { Glacier, OutlinesFile, Region, ScenesFile, type Source } from '../shared/schema';
import { siteFileExists, siteJson, siteScript } from './site-data';

/** The site ids of the ten Swiss glaciers (what `#g=` names). The page builds them from its list of defaults; they are fixed here so links stay valid. */
export const SWISS_SITE_ID: Record<string, string> = { 'B36-26': 'aletsch', 'B56-07': 'gorner', 'B40-07': 'fiescher', 'A54g-11': 'unteraar', 'B83-03': 'corbassiere', 'B57-05': 'zmutt', 'B43-03': 'rhone', 'B56-03': 'sgi-B56-03', 'B53-04': 'sgi-B53-04', 'A54e-24': 'trift' };

/** What counts as "a glacier" in each region, as the project documents it (CLAUDE.md, docs/REFERENCE.md). A proposal: the owner reads it and confirms or corrects it. */
const UNIT_RULE: Record<string, string> = {
  ch: 'The ten largest Swiss glaciers by area in the newest Swiss Glacier Inventory (SGI2023, GLAMOS).',
  'is-vatnajokull': 'The outlet glaciers of the Vatnajökull ice cap as listed in data/vatnajokull.js: RGI 6.0 basins of the ice cap.',
  'is-rest': 'The ten largest glaciers and ice caps of Iceland outside Vatnajökull: RGI 6.0 basins that touch form one ice cap, named by anchors (scripts/build_regions.py).',
  'no-mainland': "The ten largest main glaciers (hovedbre) of mainland Norway in NVE's glacier inventory.",
  'no-svalbard': 'The ten largest named glacier units of the Norwegian Polar Institute inventory of Svalbard (two unnamed Austfonna units are skipped).',
};
const SOURCE: Record<string, { id: string; url: string }> = {
  ch: { id: 'glamos-sgi', url: 'https://doi.glamos.ch/data/inventory/inventory_sgi2023_r2026.zip' },
  'is-vatnajokull': { id: 'rgi-6-iceland', url: 'https://www.glims.org/RGI/' },
  'is-rest': { id: 'rgi-6-iceland', url: 'https://www.glims.org/RGI/' },
  'no-mainland': { id: 'nve-inventory', url: 'https://www.nve.no/hydrology/glaciers/' },
  'no-svalbard': { id: 'npi-inventory', url: 'https://geodata.npolar.no' },
};
const DATA_FILE: Record<string, string> = { ch: 'data/glaciers.js', 'is-vatnajokull': 'data/vatnajokull.js', 'is-rest': 'data/iceland.js', 'no-mainland': 'data/norway.js', 'no-svalbard': 'data/svalbard.js' };

const today = () => new Date().toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((Date.parse(`2001-${a}T00:00:00Z`) - Date.parse(`2001-${b}T00:00:00Z`)) / 864e5);

/** The region records of js/regions.js: plain script, `const REGIONS_ALL = [...]`, so it is read with a line appended that hands the constant out. */
export function regionRecords(): any[] {
  const w: Record<string, any> = {};
  vm.runInNewContext(readFileSync(join(process.env.TFS_SITE ?? ROOT, 'js', 'regions.js'), 'utf8') + '\n;window.__r = REGIONS_ALL;', { window: w });
  return (w.__r as any[]).flatMap((r) => r.children ?? [r]).filter((r) => r.ready);
}

const hasConfirmation = (g: Glacier | null) => !!g && !!(g.recordConfirmation || g.placement?.confirmation || g.seasonConfirmation || g.layersConfirmation || g.stripConfirmation);

export type ImportReport = { regions: number; glaciers: number; skipped: string[]; scenes: number };

export function importSite(only?: string): ImportReport {
  const boxes: Record<string, any> = siteScript('data/boxes.js').GLACIER_BOXES.glaciers;
  const scenesJson = siteFileExists('data/scenes.json') ? siteJson('data/scenes.json').glaciers ?? {} : {};
  const report: ImportReport = { regions: 0, glaciers: 0, skipped: [], scenes: 0 };
  const imported = (note: string) => ({ from: 'the data files of the site', at: today(), note });

  for (const rec of regionRecords()) {
    if (only && rec.id !== only) continue;
    const file = DATA_FILE[rec.id]!, w = siteScript(file), swiss = rec.id === 'ch';
    const entries: any[] = swiss ? w.GLACIER_DATA.glaciers : w.REGION_ICE.outlets;
    const src = SOURCE[rec.id]!;
    const sourceName: string = swiss ? `GLAMOS Swiss Glacier Inventory ${w.GLACIER_DATA.latest_label ?? ''}`.trim() : String(w.REGION_ICE.source);
    const source: Source = swiss
      ? { id: src.id, name: sourceName, url: src.url, licence: `The site's own statement: ${w.GLACIER_DATA.licence}`, commercialUse: false, citation: w.GLACIER_DATA.sources.join(' ') }
      : { id: src.id, name: sourceName, url: src.url, licence: 'NOT READ: open the source, find its licence and write it here (the page credits it in js/regions.js).', commercialUse: true };

    const rid = rec.id as string;
    const existingRegion = existsSync(regionFile(rid)) ? JSON.parse(readFileSync(regionFile(rid), 'utf8')) : null;
    if (!existingRegion?.confirmation) {      // a region a person confirmed keeps its own text
      const ids = Object.keys(boxes).filter((k) => boxes[k].region === rid && !boxes[k].parent);
      writeJson(regionFile(rid), Region.parse({ id: rid, name: rec.name, status: 'live', centre: rec.picker.ll, zoom: rec.picker.zoom, blurb: rec.picker.text, unitRule: UNIT_RULE[rid], count: ids.length, sources: [source] }));
    }
    report.regions++;

    const keys = Object.keys(boxes).filter((k) => boxes[k].region === rid && !boxes[k].parent);
    const entryOf = (key: string) => (swiss ? entries.find((g) => g.id === key) : entries.find((o) => o.id === key));
    const ranked = keys.map((k) => ({ k, area: swiss ? entryOf(k)?.area_km2 : entryOf(k)?.areaKm2 })).sort((a, b) => b.area - a.area);
    const season = rec.season as { find: [string, string]; target?: string; pick?: string; minCover?: number; oneOrbit?: boolean };

    for (const { k: key } of ranked) {
      const b = boxes[key], e = entryOf(key);
      if (!e) { report.skipped.push(`${rid}/${key}: in boxes.js but not in ${file}`); continue; }
      const site = swiss ? SWISS_SITE_ID[key] : key;
      if (!site) { report.skipped.push(`${rid}/${key}: no site id`); continue; }
      const id = site.toLowerCase();
      const old = existsSync(glacierFile(rid, id)) ? Glacier.parse(JSON.parse(readFileSync(glacierFile(rid, id), 'utf8'))) : null;
      if (hasConfirmation(old)) { report.skipped.push(`${rid}/${id}: confirmed in the walkthrough, left as it is`); continue; }

      // scenes the site already pins: Sentinel-2 from data/scenes.json, Landsat from data/landsat/<site id>.json
      const pins = scenesJson[key]?.picks as Record<string, { date: string; orbit?: string; relaxed?: boolean }> | undefined;
      const years: Record<string, unknown> = {};
      let before = days('09-30', season.find[0]), after = Math.max(0, days(season.find[1], '09-30'));
      const widen = (date: string) => { const d = days('09-30', date.slice(5)); before = Math.max(before, d); after = Math.max(after, -d); };
      const lsFile = `data/landsat/${site}.json`;
      if (siteFileExists(lsFile)) {
        for (const [y, v] of Object.entries<any>(siteJson(lsFile).scenes ?? {}))
          { years[y] = { chosen: { sensor: v.sat, date: v.date, id: v.id, cloud: v.cloud, snow: v.snow, coverage: v.cover, ...(v.sat === 'landsat-7' && v.date >= '2003-06-01' ? { gaps: 'slc-off' } : {}) }, status: 'auto', discarded: [], note: "Landsat scene as the site's script (scripts/build_landsat.py) chose it; not looked at by a person yet." }; widen(v.date); }
      }
      for (const [y, v] of Object.entries(pins ?? {})) {
        years[y] = { chosen: { sensor: 'sentinel-2', date: v.date, orbit: v.orbit }, status: 'pinned', discarded: [], note: `Hand-chosen in the scene picker (data/scenes.json)${v.relaxed ? '; marked "relaxed": accepted although outside its usual limits' : ''}.${scenesJson[key]?.note ? ' The picker\'s note for this glacier: ' + scenesJson[key].note : ''}` };
        widen(v.date);
      }
      const nYears = Object.keys(years).length;
      const rule = {
        daysBeforeEnd: before, daysAfterEnd: after, maxCloud: 0.05, maxCloudTongue: 0.05, maxSnow: 1, fallbackCloud: 0.3, minCoverage: 1 as const, ...(siteFileExists(lsFile) ? { noDataMarginM: 1000 } : {}), oneOrbit: !!season.oneOrbit,
        note: `Imported from the site's season rule (js/regions.js): scenes ${season.find[0]} to ${season.find[1]}${season.target ? `, the clear one closest to ${season.target}` : ', September first, then August, then July'}; at most 5 % cloud, else the least cloudy up to 30 %; `
          + `the site asks for ${Math.round((season.minCover ?? 1) * 100)} % cover of the picture, this rule requires 100 %. The window here is measured from the end of the balance year (30 September) and cannot end before it, so a site window that ends earlier is widened to 30 September`
          + `${nYears ? `; it also holds the ${nYears} scenes the site already has` : ''}. The site's target day has no field in this rule yet. Check all of it against the scene statistics of this place.`,
      };
      const subs = Object.entries<any>(boxes).filter(([, x]) => x.parent === key).map(([k, x]) => ({ dataKey: k, name: x.name, pictureBox: x.box.bounds, tip: x.tip, strip3d: x.strip3d }));
      const placement = { tip: b.tip as [number, number], pictureBox: b.box.bounds, strip3d: b.strip3d, ...(b.imageFrom ? { imageFrom: b.imageFrom } : {}), ...(subs.length ? { subs } : {}) };
      const area = swiss ? e.area_km2 : e.areaKm2;
      const record = Glacier.parse({
        id, region: rid, name: swiss ? e.name : e.name, inventoryId: swiss ? key : String(e.rgi ?? key), dataKey: key, ...(site !== id ? { legacyIds: [site] } : {}),
        rank: ranked.findIndex((r) => r.k === key) + 1, areaKm2: area, areaSource: source.id, centre: swiss ? e.center : [e.lat, e.lon],
        placement, balanceYear: { start: '10-01', end: '09-30', label: 'ends-in', source: "imported: the site's scene windows are written against 30 September; say where the balance-year dates of this glacier's figures come from" }, sceneRule: rule,
        imported: imported(`Picture box, tip and 3D strip from data/boxes.js; ${nYears} scenes from data/scenes.json and data/landsat/; season from js/regions.js.`),
      });
      writeJson(glacierFile(rid, id), record);

      const epoch = (kind: 'old' | 'new', year: number, field: string) => ({ kind, year, source: source.id, ref: { file, id: swiss ? key : key, field } });
      const eps = swiss
        ? [epoch('old', Number(String(w.GLACIER_DATA.oldest_label ?? '').replace(/\D/g, '')) || 1850, 'oldest.outline'), epoch('new', e.year, 'outline')]
        : (['lia', 'latest'] as const).filter((n) => e.outlines?.[n]).map((n) => epoch(n === 'lia' ? 'old' : 'new', e.outlines[n].year, `outlines.${n}`));
      if (eps.length) writeJson(outlinesFile(rid, id), OutlinesFile.parse({ epochs: eps }));
      if (nYears) { writeJson(scenesFile(rid, id), ScenesFile.parse({ years })); report.scenes += nYears; }
      report.glaciers++;
    }
  }
  return report;
}

/** the folders that hold records, for the CLI's report */
export const recordRegions = () => (existsSync(dataRoot()) ? readdirSync(dataRoot(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);
