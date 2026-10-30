/**
 * The elevation step's build: bakes the 3D terrain file of one glacier of the records (heights, yearly surfaces where dated strips exist, peak names) and tells how it is going.
 * The same for every region: the records are exported to data/boxes.js first (the builders read the glacier's record there), then scripts/build_terrain.py <id> runs; its source of heights
 * differs by region, nothing else does. The file is derived data, not a decision: the step's confirmation stays the person's.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './data';
import { loadCtx } from './engine';

type Job = { running: boolean; log: string[]; startedAt: number; endedAt?: number; code?: number | null };
const jobs = new Map<string, Job>();
const ID = /^[a-z0-9-]+$/;

/** the verdict of scripts/terrain_quality.py on the file (data/terrain/quality.json): a warning only, never a stop. `relief` are the picture names for /__onboard/terrain-relief. */
export type TerrainQuality = { status: 'ok' | 'warn'; seams: number; seamsYear: string | null; steep: number; rough: number; why: string[]; relief: string[]; strips: { date: string; blunders: number }[] };
export type TerrainBuilt = { file: string; built?: string; names: number; namesSource?: string; yearly: boolean; matchesStrip: boolean; quality: TerrainQuality | null };
export type TerrainState = { running: boolean; log: string[]; startedAt?: number; endedAt?: number; code?: number | null; built: TerrainBuilt | null };

/** the file the manifest names for the glacier (under the id the site uses), read back: what it holds and whether its strip is the record's */
export function builtTerrain(id: string, strip?: { azimuth: number; half: number; back: number; up: number; shift?: number }, root = ROOT): TerrainBuilt | null {
  const mp = join(root, 'data', 'terrain', 'manifest.json');
  if (!existsSync(mp)) return null;
  const file = (JSON.parse(readFileSync(mp, 'utf8')) as Record<string, string>)[id];
  if (!file || !existsSync(join(root, 'data', 'terrain', file))) return null;
  const b = readFileSync(join(root, 'data', 'terrain', file)), h = JSON.parse(b.subarray(8, 8 + b.readUInt32LE(4)).toString('utf8'));
  const az = (Math.atan2(h.ue, h.un) * 180) / Math.PI;
  const matches = !strip || (Math.abs(((az - strip.azimuth + 540) % 360) - 180) < 1e-6 && h.up === strip.up && h.back === strip.back && (h.half ?? 2000) === strip.half && (h.shift ?? 0) === (strip.shift ?? 0));
  const qp = join(root, 'data', 'terrain', 'quality.json'), q = existsSync(qp) ? (JSON.parse(readFileSync(qp, 'utf8')) as Record<string, TerrainQuality & { file: string }>)[id] : undefined;
  return { file, built: h.built, names: (h.names ?? []).length, namesSource: h.namesSource, yearly: !!h.yearly, matchesStrip: matches, quality: q && q.file === file ? q : null };      // a verdict on another file is no verdict on this one
}

export function terrainState(region: string, glacier: string): TerrainState {
  const c = loadCtx(region, glacier);
  if (!c.glacier) throw new Error('no such glacier');
  const j = jobs.get(`${region}/${glacier}`);
  return { running: !!j?.running, log: j?.log.slice(-60) ?? [], startedAt: j?.startedAt, endedAt: j?.endedAt, code: j?.code, built: builtTerrain(c.glacier.dataKey ?? glacier, c.glacier.placement?.strip3d) };
}

export function startTerrain(region: string, glacier: string, python = 'python3'): TerrainState {
  if (!ID.test(region) || !ID.test(glacier)) throw new Error('not a region or glacier id');
  const c = loadCtx(region, glacier);
  if (!c.glacier?.placement?.strip3d) throw new Error('the 3D strip is not set: confirm the placement and the strip first');
  const key = `${region}/${glacier}`;
  if (jobs.get(key)?.running) return terrainState(region, glacier);
  const job: Job = { running: true, log: [], startedAt: Date.now() };
  jobs.set(key, job);
  const add = (d: Buffer) => { for (const l of d.toString().split(/\r?\n/)) if (l.trim()) job.log.push(l); if (job.log.length > 400) job.log.splice(0, job.log.length - 400); };
  const end = (code: number | null, why?: string) => { if (why) job.log.push(why); job.running = false; job.endedAt = Date.now(); job.code = code; };
  const run = (cmd: string, args: string[], then: () => void) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', add); p.stderr.on('data', add);
    p.on('error', (e) => end(null, `could not start ${cmd}: ${e.message}`));
    p.on('close', (code) => (code === 0 ? then() : end(code, `${args[args.length - 1]} stopped with code ${code}`)));
  };
  const id = c.glacier.dataKey ?? glacier;      // the key of the record in data/boxes.js and of the file in the manifest
  run(join(ROOT, 'node_modules', '.bin', 'tsx'), ['walkthrough/cli.ts', 'export'], () => run(python, ['-u', join(ROOT, 'scripts', 'build_terrain.py'), id], () => end(0)));
  return terrainState(region, glacier);
}
