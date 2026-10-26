/**
 * Proposals: what a tool found for a step, waiting for a person. They live in .cache, never in data/, so nothing a tool
 * fetched can become data without a confirmation. The wizard shows them as the starting point of the step.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './data';

export type Proposal = { at: string; by: string; note: string; data: any };
const dir = (region: string, glacier: string | null) => join(process.env.TFS_CACHE ?? join(ROOT, '.cache'), 'proposals', region, glacier ?? '_region');

export function writeProposal(region: string, glacier: string | null, step: string, by: string, note: string, data: unknown) {
  const f = join(dir(region, glacier), `${step}.json`);
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ at: new Date().toISOString(), by, note, data } satisfies Proposal));
}

/** All proposals for a region (when glacier is null) or a glacier, plus the region's, by step id. */
export function readProposals(region: string, glacier: string | null): Record<string, Proposal> {
  const out: Record<string, Proposal> = {};
  for (const d of glacier ? [dir(region, null), dir(region, glacier)] : [dir(region, null)])
    if (existsSync(d)) for (const f of readdirSync(d).filter((x) => x.endsWith('.json'))) out[f.slice(0, -5)] = JSON.parse(readFileSync(join(d, f), 'utf8')) as Proposal;
  return out;
}
