/**
 * The walkthrough engine. One set of functions behind both the CLI (`npm run walkthrough`) and the visual wizard.
 * Status is derived from the data files; the only thing a person writes is a confirmation, and it carries a hash
 * of everything upstream, so changing an earlier result marks every later step stale by itself.
 */
import { existsSync, readFileSync } from 'node:fs';
import { Glacier, OutlinesFile, Region, ScenesFile, type Confirmation } from './shared/schema';
import { glacierFile, outlinesFile, regionFile, scenesFile, writeJson } from './data';
import { hash } from './hash';
import { STEPS, stepById, type Ctx, type Patch, type StepDef } from './steps';

export type Status = 'done' | 'todo' | 'review' | 'stale' | 'blocked' | 'attention' | 'unavailable';
export type StepState = {
  id: string; phase: number; scope: 'region' | 'glacier'; title: string; why: string; look: string[]; screen: string;
  status: Status; problems: string[]; blockedBy: string[]; confirmation: Confirmation | null;
};
export type Progress = { steps: StepState[]; next: string | null; done: number; total: number; ctx: Ctx };

const read = <T>(p: string): T | null => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null);

export function loadCtx(regionId: string, glacierId?: string | null): Ctx {
  const region = read<unknown>(regionFile(regionId));
  if (!region) throw new Error(`No region "${regionId}". Create it with: npm run walkthrough -- new-region ${regionId}`);
  let glacier: Glacier | null = null, scenes: ScenesFile | null = null, outlines: OutlinesFile | null = null;
  if (glacierId) {
    const raw = read<unknown>(glacierFile(regionId, glacierId));
    if (raw) glacier = Glacier.parse(raw);
    const sc = read<unknown>(scenesFile(regionId, glacierId));
    if (sc) scenes = ScenesFile.parse(sc);
    const ol = read<unknown>(outlinesFile(regionId, glacierId));
    if (ol) outlines = OutlinesFile.parse(ol);
  }
  return { region: Region.parse(region), glacier, scenes, outlines };
}

export function saveCtx(c: Ctx) {
  writeJson(regionFile(c.region.id), c.region);
  if (c.glacier) {
    writeJson(glacierFile(c.glacier.region, c.glacier.id), c.glacier);
    if (c.scenes) writeJson(scenesFile(c.glacier.region, c.glacier.id), c.scenes);
    if (c.outlines) writeJson(outlinesFile(c.glacier.region, c.glacier.id), c.outlines);
  }
}

/** Outputs of a step and of everything it depends on, transitively: what a confirmation is "based on". */
function closure(step: StepDef, c: Ctx, seen = new Set<string>()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (s: StepDef) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out[s.id] = s.outputs(c) ?? null;
    s.needs.forEach((n) => walk(stepById(n)!));
  };
  walk(step);
  return out;
}
export const basedOn = (step: StepDef, c: Ctx) => hash(closure(step, c));

export function progress(c: Ctx): Progress {
  const wanted = STEPS.filter((s) => s.scope === 'region' || c.glacier !== null);
  const states = new Map<string, StepState>();
  const resolve = (s: StepDef): StepState => {
    const known = states.get(s.id);
    if (known) return known;
    const conf = s.confirmation(c) ?? null;
    const base = { id: s.id, phase: s.phase, scope: s.scope, title: s.title, why: s.why, look: s.look, screen: s.screen, confirmation: conf, problems: [] as string[], blockedBy: [] as string[] };
    let status: Status;
    if (!s.implemented) status = 'unavailable';
    else {
      const open = s.needs.map((n) => resolve(stepById(n)!)).filter((d) => d.status !== 'done');
      base.blockedBy = open.map((d) => d.id);
      const out = s.outputs(c);
      base.problems = out === undefined ? [] : s.problems(c);
      if (open.length) status = 'blocked';
      else if (out === undefined) status = 'todo';
      else if (!conf) status = 'review';
      else if (conf.basedOn !== basedOn(s, c)) status = 'stale';
      else status = base.problems.length ? 'attention' : 'done';
    }
    const st = { ...base, status };
    states.set(s.id, st);
    return st;
  };
  const steps = wanted.map(resolve);
  const doable = steps.filter((s) => s.status !== 'unavailable');
  const next = doable.find((s) => s.status === 'todo' || s.status === 'review' || s.status === 'stale' || s.status === 'attention')?.id ?? null;
  return { steps, next, done: doable.filter((s) => s.status === 'done').length, total: doable.length, ctx: c };
}

/** Steps that are done now and would turn stale if this step's output changed. Shown before a change is confirmed. */
export function dependents(stepId: string, c: Ctx): string[] {
  const p = progress(c);
  return p.steps.filter((s) => s.id !== stepId && s.status === 'done' && s.id !== stepId && closureIds(stepById(s.id)!).has(stepId)).map((s) => s.id);
}
function closureIds(s: StepDef, out = new Set<string>()): Set<string> {
  for (const n of s.needs) { out.add(n); closureIds(stepById(n)!, out); }
  return out;
}

export function confirm(c: Ctx, stepId: string, patch: Patch, by: string, reason: string, today = new Date().toISOString().slice(0, 10)): Ctx {
  const step = stepById(stepId);
  if (!step) throw new Error(`Unknown step "${stepId}"`);
  if (!step.implemented) throw new Error(`Step "${stepId}" is not built yet.`);
  if (reason.trim().length < 3) throw new Error('A confirmation needs a reason.');
  // apply once to get the new outputs, then stamp the confirmation with the hash of that state
  const placeholder: Confirmation = { at: today, by, reason, basedOn: 'pending' };
  const next = step.apply(c, patch, placeholder);
  const stamped: Confirmation = { ...placeholder, basedOn: basedOn(step, next) };
  const final = step.apply(c, patch, stamped);
  const problems = step.problems(final);
  if (problems.length) throw new Error(`Cannot confirm "${step.title}": ${problems.join(' ')}`);
  return final;
}

export function newRegion(id: string, name: string, centre: [number, number]): Ctx {
  if (existsSync(regionFile(id))) throw new Error(`Region "${id}" exists.`);
  const region = Region.parse({ id, name, status: 'onboarding', centre, zoom: 6, blurb: `${name}.`, sources: [] });
  const c: Ctx = { region, glacier: null, scenes: null, outlines: null };
  saveCtx(c);
  return c;
}

export function newGlacier(regionId: string, id: string, name: string, centre: [number, number]): Ctx {
  const c = loadCtx(regionId);
  if (existsSync(glacierFile(regionId, id))) throw new Error(`Glacier "${id}" exists.`);
  const src = c.region.sources[0]?.id ?? 'unset';
  const rank = 1 + (c.region.count ?? 0) * 0; // the real rank is set in the record step
  const glacier = Glacier.parse({ id, region: regionId, name, inventoryId: 'unset', rank, areaKm2: 1, areaSource: src, centre });
  const out: Ctx = { region: c.region, glacier, scenes: null, outlines: null };
  saveCtx(out);
  return out;
}
