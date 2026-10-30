/** Talks to the dev server (onboard/server.ts). */
import type { Glacier, OutlinesFile, Region, ScenesFile, Confirmation } from '../../shared/schema';

export type Status = 'done' | 'todo' | 'review' | 'stale' | 'blocked' | 'attention' | 'unavailable';
export type Step = { id: string; phase: number; scope: 'region' | 'glacier'; title: string; why: string; look: string[]; screen: string; status: Status; problems: string[]; blockedBy: string[]; confirmation: Confirmation | null };
export type State = { region: Region; glacier: Glacier | null; scenes: ScenesFile | null; outlines: OutlinesFile | null; proposals: Record<string, { at: string; by: string; note: string; data: any; heavy?: boolean }>; probing?: boolean; steps: Step[]; next: string | null; done: number; total: number };
export type Overview = { regions: { id: string; name: string; status: string; centre: [number, number]; regionProgress: { done: number; total: number; next: string | null }; glaciers: { id: string; name: string; parent?: string; rank?: number; done: number; total: number; next: string | null }[] }[]; drafts: string[]; problems: string[] };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Onboard': '1' }, body: JSON.stringify(body) });
  const j = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
export const overview = () => call<Overview>('/__onboard/overview');
export const state = (region: string, glacier: string | null) => call<State>(`/__onboard/state?region=${region}${glacier ? `&glacier=${glacier}` : ''}`);
export const dependents = (region: string, glacier: string | null, step: string) => call<string[]>(`/__onboard/dependents?region=${region}&step=${step}${glacier ? `&glacier=${glacier}` : ''}`);
export const confirmStep = (region: string, glacier: string | null, step: string, patch: unknown, reason: string) => call<{ ok: true; staled: string[] }>('/__onboard/confirm', { region, glacier, step, patch, reason, by: 'owner' });
export const newRegion = (id: string, name: string, centre: [number, number]) => call('/__onboard/new-region', { id, name, centre });
export const newGlacier = (region: string, id: string, name: string, centre: [number, number]) => call('/__onboard/new-glacier', { region, id, name, centre });
export const scan = (region: string, glacier: string, year: number, from: string, to: string) => call<{ year: number; candidates: { date: string; orbit: string; cloud: number; snow: number; coverage: number }[] }>(`/__onboard/scan?region=${region}&glacier=${glacier}&year=${year}&from=${from}&to=${to}`);
export const candidates = (glacier: string, year: number) => call<{ candidates: { date: string; orbit: string; cloud: number; snow: number; coverage: number }[] }>(`/api/candidates/${glacier}/${year}`);
export const proposal = (region: string, glacier: string | null, step: string) => call<any>(`/__onboard/proposal?region=${region}&step=${step}${glacier ? `&glacier=${glacier}` : ''}`);
export type LandsatCand = { sensor: string; date: string; id: string; path: string; row: string; level: 'L2' | 'L1'; usable: boolean; why?: string; gaps?: 'slc-off' | 'outside-glacier'; cloud: number; shadow: number; snow: number; coverage: number; basis: 'box' | 'scene' };
export const landsatScan = (region: string, glacier: string, year: number, from: string, to: string, margin: number) => call<{ year: number; candidates: LandsatCand[] }>(`/__onboard/landsat-scan?region=${region}&glacier=${glacier}&year=${year}&from=${from}&to=${to}&margin=${margin}`);
export const probeLayers = (region: string, glacier: string) => call<{ ok: true }>('/__onboard/probe-layers', { region, glacier });

/** What the form of the step holds right now, so the real page can show it before anything is saved. */
export const draft = (region: string, glacier: string, step: string | null, patch: unknown) => call<{ ok: true }>('/__onboard/draft', { region, glacier, step, patch });

export type LandsatState = { running: boolean; log: string[]; startedAt?: number; endedAt?: number; code?: number | null; built: { years: number; firstYear?: number; lastYear?: number; list: { year: number; date: string; sat: string; shiftM?: [number, number]; filled?: number }[] } | null };
export type LandsatAlt = { date: string; id: string; sat: string; path: string; row: string; time: string; sun: number; cloud: number; tcloud: number; snow: number; clear: boolean; partial: boolean; cover: number; shiftM: [number, number] | null; positionConfirmed: boolean; current: boolean; img: string };
export type LandsatAlts = { outlet: string; madeAt?: string; rejected: string[]; picks: Record<string, string>; years: Record<string, LandsatAlt[]> };
export const landsatState = (region: string, glacier: string) => call<LandsatState>(`/__onboard/landsat-state?region=${region}&glacier=${glacier}`);
export type TerrainState = { running: boolean; log: string[]; startedAt?: number; endedAt?: number; code?: number | null; built: { file: string; built?: string; names: number; namesSource?: string; yearly: boolean; matchesStrip: boolean; quality: { status: 'ok' | 'warn'; seams: number; seamsYear: string | null; steep: number; rough: number; why: string[]; relief: string[]; strips: { date: string; blunders: number }[] } | null } | null };
export const terrainState = (region: string, glacier: string) => call<TerrainState>(`/__onboard/terrain-state?region=${region}&glacier=${glacier}`);
export const terrainBuild = (region: string, glacier: string) => call<TerrainState>('/__onboard/terrain-build', { region, glacier });
export const landsatAlts = (region: string, glacier: string) => call<LandsatAlts>(`/__onboard/landsat-alts?region=${region}&glacier=${glacier}`);
export const landsatPick = (region: string, glacier: string, year: number, id: string | null) => call<LandsatAlts>('/__onboard/landsat-pick', { region, glacier, year, id });
export const landsatBuild = (region: string, glacier: string) => call<LandsatState>('/__onboard/landsat-build', { region, glacier });
