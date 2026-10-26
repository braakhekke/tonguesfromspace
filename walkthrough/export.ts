/**
 * From the records to the files the site reads: `npm run walkthrough -- export` (and `export --check`, which CI runs).
 *
 *   data/boxes.js    picture box, tongue tip and 3D strip of every glacier   <- placement of the records
 *   data/scenes.json the scenes a person pinned or approved, per glacier     <- scenes of the records
 *   worker/glacier-index.json what the relay may be asked for                <- placement and season of the records
 *
 * The records are the source of truth; these files are generated and carry a header that says so. `derived` is what the page makes of a box,
 * worked out here by the page's own rule (Leaflet's EPSG:3857, 10 m ground pixels, rounded) and checked against the page by tests/test_boxes.py.
 * Glaciers of regions the walkthrough does not know are not touched: nothing is exported for them and `--check` says so.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadAll } from './data';
import { siteEntry, siteFileExists, siteJson, siteScript } from './site-data';
import { regionRecords } from './import-site';
import type { Glacier, ScenesFile } from '../shared/schema';

const SITE = () => process.env.TFS_SITE ?? ROOT;
export const GROUND_RES = 10;      // CDSE.groundRes in js/03-imagery.js
export const MAX_PX = 2500;      // CDSE.maxPx
const R = 6378137;

/** js/03-imagery.js imageBox(): Leaflet's EPSG3857 projection, w and h rounded separately, scaled down to MAX_PX, bbox rounded to whole metres. */
export function imageBox(b: [[number, number], [number, number]]) {
  const merc = (lat: number, lon: number): [number, number] => { const s = Math.sin((Math.max(Math.min(85.0511287798, lat), -85.0511287798) * Math.PI) / 180); return [(R * lon * Math.PI) / 180, (R * Math.log((1 + s) / (1 - s))) / 2]; };
  const [x0, y0] = merc(b[0][0], b[0][1]), [x1, y1] = merc(b[1][0], b[1][1]);
  const lat = (b[0][0] + b[1][0]) / 2, scale = 1 / Math.cos((lat * Math.PI) / 180);
  let w = Math.round((x1 - x0) / (GROUND_RES * scale)), h = Math.round((y1 - y0) / (GROUND_RES * scale));
  const k = Math.min(1, MAX_PX / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  return { bbox: [x0, y0, x1, y1].map(Math.round), w, h };
}

/** js/02-glaciers.js shortName(): the local name without the word for glacier. */
export function shortName(n: string): string {
  const t = (n || '').trim()
    .replace(/^(Glacier|Ghiacciaio|Vadret|Vadrec|Glatscher)\s+(de la |de l'|des |du |de |d'|da |dal |del |dla )?/i, '')
    .replace(/\s+\((.*)\)$/, '').replace(/\s+(VS|BE|GR|UR|TI|GL|OW|NW|SZ)$/, '').replace(/-?gletscher$/i, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : n;
}

const HEADER = "// picture box, tongue tip and 3D strip of every glacier. GENERATED from the records of data/regions/ by `npm run walkthrough -- export`: change them in the walkthrough, not here (see docs/WALKTHROUGH.md)\n";
const DOC = "Picture box, tongue tip and 3D strip of every glacier; generated from data/regions/ (npm run walkthrough -- export). 'derived' is what the page makes of the box: never edit it by hand.";

/** What the files are made from: the records on disk, with the choices of a step that is being edited (not confirmed, not saved) laid over them. The real-page preview uses the same code as the export. */
export type Draft = Record<string, { glacier?: Glacier; scenes?: ScenesFile | null }>;
type Placed = { g: Glacier; region: string; scenes: ScenesFile | null };
function placed(draft: Draft = {}): Placed[] {
  const order = regionRecords().map((r) => r.id as string);
  return loadAll().regions.flatMap((r) => r.glaciers.map((x) => { const d = draft[x.glacier.id]; return { g: d?.glacier ?? x.glacier, region: r.region.id, scenes: d && 'scenes' in d ? d.scenes ?? null : x.scenes }; }))
    .filter((x) => x.g.placement)
    .sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region) || a.g.rank - b.g.rank);
}

export function boxesObject(draft: Draft = {}) {
  const out: Record<string, unknown> = {};
  const dataFiles: Record<string, string> = { 'is-vatnajokull': 'data/vatnajokull.js', 'is-rest': 'data/iceland.js', 'no-mainland': 'data/norway.js', 'no-svalbard': 'data/svalbard.js' };
  for (const { g, region } of placed(draft)) {
    const p = g.placement!, key = g.dataKey ?? g.id;
    let derived: Record<string, unknown>;
    if (p.imageFrom === 'cap') { const im = siteEntry(dataFiles[region]!, key).image; derived = { bbox: im.bbox, w: im.w, h: im.h }; }
    else derived = imageBox(p.pictureBox);
    out[key] = { name: region === 'ch' ? shortName(g.name) : g.name, region, box: { bounds: p.pictureBox }, tip: p.tip, strip3d: p.strip3d, derived, ...(p.imageFrom ? { imageFrom: p.imageFrom } : {}) };
    for (const s of p.subs ?? []) out[s.dataKey] = { name: s.name, region, box: { bounds: s.pictureBox }, tip: s.tip, strip3d: s.strip3d, derived: imageBox(s.pictureBox), parent: key };
  }
  return out;
}
export const boxesFile = (draft: Draft = {}) => HEADER + 'window.GLACIER_BOXES = ' + JSON.stringify({ _doc: DOC, version: 1, glaciers: boxesObject(draft) }, null, 1) + ';\n';

/** data/scenes.json: the Sentinel-2 scenes a person pinned or approved (the page reads `picks` only). Years without one are chosen by the page, as before. */
export function scenesObject(draft: Draft = {}) {
  const glaciers: Record<string, unknown> = {};
  for (const { g, scenes: sc } of placed(draft)) {
    const picks: Record<string, { date: string; orbit: string; relaxed?: boolean }> = {};
    for (const [y, v] of Object.entries(sc?.years ?? {})) if (v.chosen?.sensor === 'sentinel-2' && (v.status === 'pinned' || v.status === 'approved') && v.chosen.orbit) picks[y] = { date: v.chosen.date, orbit: v.chosen.orbit, ...(/relaxed/.test(v.note ?? '') ? { relaxed: true } : {}) };
    if (!Object.keys(picks).length) continue;
    glaciers[g.dataKey ?? g.id] = { name: g.name, picks };
  }
  return { version: 1, glaciers };
}
export const scenesJson = (draft: Draft = {}) => JSON.stringify(scenesObject(draft), null, 1) + '\n';

/**
 * worker/glacier-index.json: what the relay may be asked for. A glacier is in it when its placement and season are set and either confirmed or imported from the site's own data
 * (published as it is); the relay builds every Copernicus request from this entry, so a glacier that is not here cannot be asked for.
 */
export function glacierIndex(draft: Draft = {}) {
  const out: Record<string, unknown> = {};
  for (const { g, region, scenes } of placed(draft))
    if (g.balanceYear && g.sceneRule && (g.seasonConfirmation || g.imported)) out[g.id] = { region, name: g.name, pictureBox: g.placement!.pictureBox, balanceYear: g.balanceYear, sceneRule: g.sceneRule, hasScenes: !!scenes };
  return out;
}

export type Generated = { file: string; text: string };
export const generated = (): Generated[] => [{ file: 'data/boxes.js', text: boxesFile() }, { file: 'data/scenes.json', text: scenesJson() }, { file: 'worker/glacier-index.json', text: JSON.stringify(glacierIndex(), null, 1) + '\n' }];

/** `--check`: the committed files are what the records say. Compared as data, not as bytes, so the formatting of a tool never fails it. */
export function check(): string[] {
  const bad: string[] = [];
  for (const { file, text } of generated()) {
    const p = join(SITE(), file);
    if (!existsSync(p)) { bad.push(`${file} is missing`); continue; }
    const parse = (t: string) => JSON.parse(t.replace(/^[^{]*?(?=\{)/s, '').replace(/;\s*$/, ''));
    const have = parse(readFileSync(p, 'utf8')), want = parse(text);
    delete have._doc; delete want._doc;      // the explanation in the file is not data
    if (file.endsWith('scenes.json')) { for (const k of Object.keys(have.glaciers ?? {})) { for (const x of ['savedAt', 'window', 'orbit', 'note']) delete have.glaciers[k][x]; } delete have.generated; }
    if (JSON.stringify(canon(have)) !== JSON.stringify(canon(want))) bad.push(`${file} differs from what the records say: run \`npm run walkthrough -- export\``);
  }
  return bad;
}
const canon = (v: any): any => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);

export function exportAll(): string[] {
  const written: string[] = [];
  for (const { file, text } of generated()) { writeFileSync(join(SITE(), file), text); written.push(file); }
  return written;
}
export { siteFileExists, siteJson, siteScript };
