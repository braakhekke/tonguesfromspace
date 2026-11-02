/**
 * The Landsat step's build: runs scripts/build_landsat.py for one glacier of the records and tells how it is going.
 * The script reads the glacier's record (picture box, tip, outline, scene rule) and writes data/landsat/<outlet>.json and /<outlet>/<year>.jpg;
 * the pictures themselves are not part of the record, the step's output is only what the build made (how many years, which).
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './data';
import { loadCtx } from './engine';

type Job = { running: boolean; log: string[]; startedAt: number; endedAt?: number; code?: number | null };
const jobs = new Map<string, Job>();
const ID = /^[a-z0-9-]+$/;

/** the name the pictures are filed under: the glacier's old site id where it has one, else its id (what the server and the page look for) */
export const landsatOutlet = (id: string, legacy?: string[]) => legacy?.[0] ?? id;

export type LandsatYear = { year: number; date: string; sat: string; shiftM?: [number, number]; filled?: number };
export type LandsatState = { running: boolean; log: string[]; startedAt?: number; endedAt?: number; code?: number | null; built: { years: number; firstYear?: number; lastYear?: number; list: LandsatYear[] } | null };

export function builtYears(outlet: string, root = ROOT): LandsatState['built'] {
  const f = join(root, 'data', 'landsat', `${outlet}.json`);
  if (!existsSync(f)) return null;
  const scenes = (JSON.parse(readFileSync(f, 'utf8')).scenes ?? {}) as Record<string, { date: string; sat: string; shiftM?: [number, number]; filled?: number }>;
  const list = Object.entries(scenes).map(([y, s]) => ({ year: Number(y), date: s.date, sat: s.sat, ...(s.shiftM ? { shiftM: s.shiftM } : {}), ...(s.filled ? { filled: s.filled } : {}) })).sort((a, b) => a.year - b.year);
  return { years: list.length, firstYear: list[0]?.year, lastYear: list[list.length - 1]?.year, list };
}

export function buildState(region: string, glacier: string): LandsatState {
  const c = loadCtx(region, glacier);
  if (!c.glacier) throw new Error('no such glacier');
  const j = jobs.get(`${region}/${glacier}`);
  return { running: !!j?.running, log: j?.log.slice(-60) ?? [], startedAt: j?.startedAt, endedAt: j?.endedAt, code: j?.code, built: builtYears(landsatOutlet(glacier, c.glacier.legacyIds)) };
}

export type LandsatAlt = { date: string; id: string; sat: string; path: string; row: string; time: string; sun: number; cloud: number; tcloud: number; snow: number; clear: boolean; partial: boolean; cover: number; shiftM: [number, number] | null; positionConfirmed: boolean; current: boolean; img: string };
export type LandsatAlts = { outlet: string; madeAt?: string; rejected: string[]; picks: Record<string, string>; years: Record<string, LandsatAlt[]>; reasons: Record<string, string> };

const picksFile = (root = ROOT) => join(root, 'scripts', 'landsat-picks.json');
const readPicks = (outlet: string, root = ROOT): Record<string, string> => (existsSync(picksFile(root)) ? (JSON.parse(readFileSync(picksFile(root), 'utf8'))[outlet] ?? {}) : {});

/** The alternatives of every year (the best three scenes by the scene rule, written by `build_landsat.py --alternatives`) and the owner's picks so far. */
export function landsatAlts(region: string, glacier: string, root = ROOT): LandsatAlts {
  const c = loadCtx(region, glacier);
  if (!c.glacier) throw new Error('no such glacier');
  const outlet = landsatOutlet(glacier, c.glacier.legacyIds), f = join(root, '.cache', 'landsat-alts', `${outlet}.json`);
  const made = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  return { outlet, madeAt: made?.madeAt, rejected: made?.rejected ?? [], picks: readPicks(outlet, root), years: made?.years ?? {}, reasons: made?.reasons ?? {} };
}

/** The owner's choice of a scene for a year (scripts/landsat-picks.json: year -> scene id; the build puts that scene first). id null takes the pick back. Nothing is rebuilt here. */
export function setLandsatPick(region: string, glacier: string, year: number, id: string | null, root = ROOT) {
  const c = loadCtx(region, glacier);
  if (!c.glacier) throw new Error('no such glacier');
  if (!Number.isInteger(year)) throw new Error('not a year');
  const outlet = landsatOutlet(glacier, c.glacier.legacyIds), alts = landsatAlts(region, glacier, root);
  if (id !== null && !(alts.years[String(year)] ?? []).some((a) => a.id === id)) throw new Error('that scene is not one of the alternatives of this year');
  const all = existsSync(picksFile(root)) ? JSON.parse(readFileSync(picksFile(root), 'utf8')) : {};
  const mine = { ...(all[outlet] ?? {}) };
  if (id === null) delete mine[String(year)]; else mine[String(year)] = id;
  all[outlet] = Object.fromEntries(Object.entries(mine).sort());
  writeFileSync(picksFile(root), JSON.stringify(all, null, 1) + '\n');
  return landsatAlts(region, glacier, root);
}

export function startBuild(region: string, glacier: string, python = 'python3'): LandsatState {
  if (!ID.test(region) || !ID.test(glacier)) throw new Error('not a region or glacier id');
  const c = loadCtx(region, glacier);
  if (!c.glacier?.placement?.pictureBox) throw new Error('the picture box is not set: confirm the placement first');
  const key = `${region}/${glacier}`;
  if (jobs.get(key)?.running) return buildState(region, glacier);
  const job: Job = { running: true, log: [], startedAt: Date.now() };
  jobs.set(key, job);
  const add = (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) if (l.trim()) job.log.push(l); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); };
  const p = spawn(python, ['-u', join(ROOT, 'scripts', 'build_landsat.py'), '--outlet', landsatOutlet(glacier, c.glacier.legacyIds)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', add); p.stderr.on('data', add);
  p.on('error', (e) => { job.log.push(`could not start ${python}: ${e.message}`); job.running = false; job.endedAt = Date.now(); job.code = null; });
  p.on('close', (code) => { job.running = false; job.endedAt = Date.now(); job.code = code; if (code !== 0) job.log.push(`the build stopped with code ${code}`); });
  return buildState(region, glacier);
}
