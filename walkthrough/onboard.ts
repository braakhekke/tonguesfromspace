/**
 * Start the onboarding of one glacier or a group, the way a chat request does:
 *
 *   npm run onboard -- <region-id> "<Glacier name>[@lat,lon]" ... [--region-name "Name"] [--no-open] [--no-layers]
 *
 *  1. makes the region (needs --region-name) and each glacier as a draft, if they are new;
 *  2. looks up the best outline source that always answers (GLIMS: RGI 6.0 and the dated outlines, sources/glims.ts) and writes PROPOSALS for the record, the outlines, the
 *     picture box and tip, the season (copied from the closest region already set up, and said so) and the map layers;
 *  3. starts the walkthrough server if it is not running and opens it in a NEW browser window on the first step that needs a person.
 * Nothing is confirmed: the wizard shows every proposal as a starting point, and the report says what it could not fill and why. A name that GLIMS does not know needs
 * its coordinates: `"Franz Josef@-43.4678,170.1883"`. A national inventory (see walkthrough/outline-sources.json) is better than RGI where one exists: add it with
 * `npm run walkthrough -- add-source` and say so in the outline step.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dataRoot, ROOT } from './data';
import { loadCtx, newRegion, progress } from './engine';
import { probeGlacierLayers } from './probe-layers';
import { lookUp, proposeGlims, RGI_SOURCE, GLIMS_SOURCE, type Proposed } from './propose-glims';
import { findByName, type Rgi } from './sources/glims';
import { regionFile, glacierFile } from './data';
import { readFileSync, writeFileSync } from 'node:fs';
import type { LatLon } from '../shared/schema';
import { MAX_PER_REGION, MIN_ONBOARD_KM2 } from '../shared/geo';

const PORT = Number(process.env.TFS_WALKTHROUGH_PORT ?? 5174);
const BASE = `http://localhost:${PORT}`;

export type Spec = { name: string; at: LatLon | null };
export const parseSpec = (s: string): Spec => {
  const m = /^(.*?)@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s);
  return m ? { name: m[1]!.trim(), at: [Number(m[2]), Number(m[3])] } : { name: s.trim(), at: null };
};

const serverUp = () => fetch(`${BASE}/__onboard/overview`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok).catch(() => false);

/** The walkthrough server, running in the background after this command ends (its log is .cache/walkthrough.log). */
export async function ensureServer(log: (m: string) => void = () => {}): Promise<void> {
  if (await serverUp()) return log('the walkthrough server is already running');
  mkdirSync(join(ROOT, '.cache'), { recursive: true });
  const out = openSync(join(ROOT, '.cache', 'walkthrough.log'), 'a');
  spawn(join(ROOT, 'node_modules', '.bin', 'tsx'), ['walkthrough/server.ts'], { cwd: ROOT, detached: true, stdio: ['ignore', out, out], env: { ...process.env, TFS_WALKTHROUGH_PORT: String(PORT) } }).unref();
  for (let i = 0; i < 60; i++) { if (await serverUp()) return log('started the walkthrough server'); await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('the walkthrough server did not start: see .cache/walkthrough.log');
}

/** A new browser window (Chrome if it is installed, else the default browser). */
export function openWindow(url: string) {
  const mac = process.platform === 'darwin';
  const args = mac ? (existsSync('/Applications/Google Chrome.app') ? ['-na', 'Google Chrome', '--args', '--new-window', url] : [url]) : [url];
  spawn(mac ? 'open' : 'xdg-open', args, { detached: true, stdio: 'ignore' }).unref();
}

export type KnownSource = { id: string; name: string; url: string; area: [number, number, number, number]; offers: string; fetch: 'automatic' | 'manual' | 'login'; how: string; better_than_rgi: boolean; national: boolean };
/** The outline sources of walkthrough/outline-sources.json that cover these places, said for the report. */
export function knownSources(at: LatLon[]): string[] {
  const all = (JSON.parse(readFileSync(join(ROOT, 'walkthrough', 'outline-sources.json'), 'utf8')) as { sources: KnownSource[] }).sources;
  const here = all.filter((s) => at.some(([la, lo]) => la >= s.area[0] && la <= s.area[2] && lo >= s.area[1] && lo <= s.area[3]));
  const national = here.filter((s) => s.national), newer = here.filter((s) => !s.national && s.better_than_rgi);
  return [
    `Outline sources known for this place: ${here.map((s) => `${s.name} [${s.fetch}${s.better_than_rgi ? ', better than RGI 6.0' : ''}]`).join('; ')}.`,
    national.length
      ? `A national inventory covers this place and is better than RGI 6.0: ${national.map((s) => `${s.id}: ${s.how}`).join('; ')}.`
      : `No national inventory is on the list for this place: look for one on the web (a glaciological service of the country, the national mapping agency) and add what is found with \`npm run walkthrough -- add-source\`.${newer.length ? ` Newer than RGI 6.0 and global: ${newer.map((s) => `${s.name} (${s.fetch}: ${s.how})`).join('; ')}.` : ''}`,
  ];
}

export async function onboard(region: string, specs: Spec[], opts: { regionName?: string; parent?: string; layers?: boolean; open?: boolean; log?: (m: string) => void; fetch?: typeof fetch } = {}) {
  const log = opts.log ?? console.log, f = opts.fetch ?? fetch;
  if (!/^[a-z0-9-]+$/.test(region)) throw new Error(`"${region}" is not a region id (lower case letters, digits and hyphens).`);

  // 1. where is each glacier
  const placed: { spec: Spec; at: LatLon }[] = [];
  for (const s of specs) {
    if (s.at) { placed.push({ spec: s, at: s.at }); continue; }
    const hits = await findByName(s.name, f);
    if (hits.length === 0) throw new Error(`GLIMS knows no glacier named "${s.name}". Give its coordinates: "${s.name}@lat,lon".`);
    if (hits.length > 1) throw new Error(`"${s.name}" matches ${hits.length} glaciers in GLIMS: ${hits.slice(0, 6).map((h) => `${h.name} at ${h.centre[0].toFixed(4)},${h.centre[1].toFixed(4)}`).join('; ')}. Choose one: "${s.name}@lat,lon".`);
    placed.push({ spec: s, at: hits[0]!.centre });
  }

  // 2. what GLIMS knows about every glacier (so the group can be ranked by area first); glaciers known to be under MIN_ONBOARD_KM2 are left out
  const looked = [];
  for (const p of placed) looked.push({ ...p, look: await lookUp(p.at, p.spec.name, f) });
  const small = looked.filter((x) => x.look.g.areaKm2 < MIN_ONBOARD_KM2);
  for (const x of small) log(`left out: ${x.spec.name} (${x.look.g.rgiId}) is ${x.look.g.areaKm2} km² in the inventory, under the ${MIN_ONBOARD_KM2} km² minimum for onboarding`);
  const room = MAX_PER_REGION - (existsSync(join(dataRoot(), region)) ? readdirSync(join(dataRoot(), region), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(glacierFile(region, d.name))).length : 0);
  const big = looked.filter((x) => !small.includes(x)).sort((a, b) => b.look.g.areaKm2 - a.look.g.areaKm2);
  const over = big.slice(Math.max(0, room));
  for (const x of over) log(`left out: ${x.spec.name} (${x.look.g.areaKm2} km²): a region holds at most ${MAX_PER_REGION} glaciers, the largest ones`);
  const found = big.slice(0, Math.max(0, room));
  if (found.length === 0) throw new Error(`Nothing to onboard: every glacier asked for is under ${MIN_ONBOARD_KM2} km², or the region already holds ${MAX_PER_REGION}.`);
  if (!existsSync(regionFile(region))) {
    if (!opts.regionName) throw new Error(`Region "${region}" does not exist yet: say what it is called with --region-name "Name".`);
    newRegion(region, opts.regionName, found[0]!.at);
    log(`made the region ${region}`);
  }
  const ranked = [...found].sort((a, b) => b.look.g.areaKm2 - a.look.g.areaKm2);
  const done: Proposed[] = [];
  for (const x of found) done.push(await proposeGlims(region, x.look, { name: x.spec.name, rank: ranked.indexOf(x) + 1, log }));
  if (opts.parent) for (const p of done) {      // outlets of an ice cap: records of their own, with the cap as parent (they do not count towards a region's top list)
    const file = glacierFile(region, p.id), rec = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ ...rec, parent: opts.parent }, null, 2) + '\n');
  }

  // 3. map layers, over the proposed box
  const layers: Record<string, string> = {}, speed: Record<string, string> = {};
  if (opts.layers !== false) for (const p of done) {
    try {
      const r = await probeGlacierLayers(region, p.id, f, () => {}, { box: p.box, outlineSources: ['rgi-6', ...(p.older ? ['glims'] : [])] });
      const on = Object.values(r?.found.layers ?? {}).filter((l) => l?.state === 'enabled').length;
      layers[p.id] = `${on} of ${Object.keys(r?.found.layers ?? {}).length} layers found`;
      const v = r?.found.layers.velocity; speed[p.id] = v?.state === 'enabled' ? (v.note ?? 'an ITS_LIVE mosaic holds it') : v ? `not available: ${v.reason}` : 'not looked for';
    } catch (e) { layers[p.id] = `not run: ${(e as Error).message}`; }
  }

  // 4. the window: the first step that needs a person
  const first = done[0]!, c = loadCtx(region, first.id);
  const regionNext = progress(loadCtx(region)).next, next = regionNext ?? progress(c).next ?? 'glacier.record';
  const url = `${BASE}/onboard/${region}/${regionNext ? '-' : first.id}/${next}`;
  if (opts.open !== false) { await ensureServer(log); openWindow(url); }

  // 5. what was filled, and what is left
  const report = [
    ...(small.length ? [`Left out (under ${MIN_ONBOARD_KM2} km²): ${small.map((x) => `${x.spec.name} (${x.look.g.areaKm2} km²)`).join('; ')}.`] : []),
    `Filled in as proposals (nothing confirmed): ${done.map((p) => `${p.name} (${p.rgiId}, ${p.areaKm2} km²${p.older ? `, old outline ${p.older.date.slice(0, 4)}` : ', no old outline found'})`).join('; ')}.`,
    `Per glacier: record, outline, picture box and tongue tip (first guess), season (${done.map((p) => `${p.name}: ${p.seasonFrom ? `copied from ${p.seasonFrom}` : 'none proposed, no glacier is set up near enough to copy from'}`).join('; ')}), map layers (${Object.entries(layers).map(([k, v]) => `${k}: ${v}`).join('; ') || 'skipped'}).`,
    `Sources proposed: ${[RGI_SOURCE, GLIMS_SOURCE].map((s) => s.name).join('; ')}. Their licences are NOT READ: open the pages and write the licence into each source (region step).`,
    `Left for you: the region's unit rule (a placeholder), the licences, the tongue tip (southernmost point of the outline is a guess), balance-year dates, scene review (the scans run in the wizard), 3D strip and camera, then the elevation model that covers the strip.`,
    `Ice speed (ITS_LIVE, one annual mosaic per RGI region): ${done.map((p) => `${p.name}: ${speed[p.id] ?? 'not looked for (--no-layers)'}`).join('; ')}. After the box and tip are confirmed: \`python3 scripts/build_itslive.py --id <id>\` (cuts the glacier out of its mosaic and makes the flowline; docs/ADD_A_GLACIER.md, "Ice speed"), then switch the region's \`speed\` feature on in js/regions.js and add the source \`itslive\` to the region. \`python3 scripts/audit_glaciers.py\` shows the piece "speed".`,
    `Landsat before 2016 (colour-matched across the years on a patch of bare rock): the wizard has a step "Landsat before 2016" with a Build button, after the scene review. It is not run here: it depends on the box, which is only a first guess now. By hand: ${done.map((p) => `\`python3 scripts/build_landsat.py --outlet ${p.id}\``).join('; ')}.`,
    `Baked 3D terrain with peak names (the same for every region): the wizard's elevation step has a "Build the terrain file" button; it is not run here because it needs the confirmed 3D strip (a changed strip makes the file stale). By hand: \`python3 scripts/build_terrain.py <id>\`. Every build is measured (scripts/terrain_quality.py: seams between the years, which come from matching errors in the elevation strips); the elevation step shows the verdict and two relief pictures. It only warns, so look at the pictures before confirming.`,
    ...knownSources(done.map((p) => p.centre)),
    `Wizard: ${url}`,
  ];
  for (const l of report) log(l);
  return { url, done, layers, report };
}

if (process.argv[1]?.endsWith('onboard.ts')) {
  const a = process.argv.slice(2), flag = (n: string) => { const i = a.indexOf(n); if (i < 0) return undefined; const v = a[i + 1]; a.splice(i, 2); return v; }, bool = (n: string) => { const i = a.indexOf(n); if (i < 0) return false; a.splice(i, 1); return true; };
  const regionName = flag('--region-name'), parent = flag('--parent'), noOpen = bool('--no-open'), noLayers = bool('--no-layers');
  const [region, ...names] = a;
  if (!region || names.length === 0) { console.error('usage: npm run onboard -- <region-id> "<Glacier name>[@lat,lon]" ... [--region-name "Name"] [--parent <ice-cap-id>] [--no-open] [--no-layers]'); process.exit(2); }
  onboard(region, names.map(parseSpec), { regionName, parent, open: !noOpen, layers: !noLayers }).catch((e) => { console.error(`\n${(e as Error).message}`); process.exit(1); });
}
