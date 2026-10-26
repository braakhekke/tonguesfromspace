/**
 * The relay: /api/candidates, /api/latest, /api/image. The browser sends meaning (glacier, date, style, tile);
 * this file builds the Copernicus request from the glacier record. There is nothing to validate in a
 * request body because there is no request body.
 */
import { imageGrid } from '../../shared/geo';
import { processBody, parseStatistics, statisticsBody, STATS_RES_M, STYLES, RENDER_FINGERPRINT_SOURCE, type Style } from '../../shared/copernicus';
import { sceneWindow, yearOfScene } from '../../shared/season';
import { callCdse, hasAccounts } from './cdse';
import { kvGet, kvPut, overLimit, sha } from './cache';
import type { Deps, Env, IndexEntry } from './env';

const DAY = 86_400;
const FIRST_SENTINEL_YEAR = 2015; // Sentinel-2A launched mid-2015; the glacier's own rule decides what counts
export const LATEST_DAYS = 60;
export const RECENT_DAYS = 130;

const fail = (status: number, message: string, headers: HeadersInit = {}) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const daysAgo = (now: number, n: number) => new Date(now - n * 86_400_000).toISOString().slice(0, 10);

let fingerprint: Promise<string> | null = null;
/** Hash of all evalscripts: part of every cache key, so changing the rendering invalidates old pictures without anyone bumping a number. */
export const renderFingerprint = () => (fingerprint ??= sha(RENDER_FINGERPRINT_SOURCE));

const inflight = new Map<string, Promise<{ status: number; type: string; data: ArrayBuffer }>>();

/** One upstream fetch shared by identical simultaneous requests; successful answers are cached. */
async function cached(env: Env, deps: Deps, key: string, ttl: number, ip: string, run: () => Promise<Response>): Promise<{ status: number; type: string; data: ArrayBuffer; hit: boolean } | Response> {
  const found = await kvGet(env, key);
  if (found) return { status: 200, ...found, hit: true };
  let job = inflight.get(key);
  if (!job) {
    if (overLimit(ip, deps.now())) return fail(429, 'Too many requests. Please wait a minute and try again.', { 'Retry-After': '60' });
    job = (async () => {
      const r = await run();
      const out = { status: r.status, type: r.headers.get('Content-Type') ?? 'application/octet-stream', data: await r.arrayBuffer() };
      if (r.ok) await kvPut(env, key, out.data, out.type, ttl, deps.now());
      return out;
    })();
    inflight.set(key, job);
    job.finally(() => inflight.delete(key)).catch(() => {});
  }
  try { return { ...(await job), hit: false }; } catch (e) { return fail(502, (e as Error).message); }
}

function entryOf(deps: Deps, id: string): IndexEntry | Response {
  const e = deps.index[id];
  return e ?? fail(404, `Unknown glacier "${id}", or it is not published yet.`);
}

export async function candidates(env: Env, deps: Deps, id: string, period: string, ip: string): Promise<Response> {
  const e = entryOf(deps, id);
  if (e instanceof Response) return e;
  if (!hasAccounts(env)) return fail(502, 'The relay has no Copernicus credentials yet.');
  const now = deps.now(), t = today(now);
  let from: string, to: string, ttl = DAY;
  if (period === 'latest') {
    from = daysAgo(now, LATEST_DAYS); to = t;
  } else {
    const year = Number(period);
    if (!/^\d{4}$/.test(period) || year < FIRST_SENTINEL_YEAR || year > Number(t.slice(0, 4)) + 1) return fail(400, 'year out of range');
    const w = sceneWindow(e.balanceYear, e.sceneRule, year);
    if (w.from > t) return fail(400, 'the scene window of this year has not opened yet');
    from = w.from; to = w.to < t ? w.to : t;
    if (w.to < t) ttl = 180 * DAY; // a closed window never changes
  }
  const grid = imageGrid(e.pictureBox);
  const lat = (e.pictureBox[0][0] + e.pictureBox[1][0]) / 2;
  const res = STATS_RES_M / Math.cos((lat * Math.PI) / 180);
  const body = statisticsBody(grid.bbox, from, to, res);
  const key = `cand:${await renderFingerprint()}:${id}:${from}:${to}`;
  const out = await cached(env, deps, key, ttl, ip, () => callCdse(env, deps.fetch, now, '/api/v1/statistics', body, 'application/json'));
  if (out instanceof Response) return out;
  if (out.status !== 200) return new Response(out.data, { status: out.status, headers: { 'Content-Type': out.type } });
  const list = parseStatistics(JSON.parse(new TextDecoder().decode(out.data))).filter((c) => c.date >= from && c.date <= to);
  return new Response(JSON.stringify({ glacier: id, from, to, candidates: list }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': ttl > DAY ? 'public, max-age=86400' : 'public, max-age=3600', 'X-Cache': out.hit ? 'HIT' : 'MISS' },
  });
}

export function dateAllowed(date: string, e: IndexEntry, now: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return false;
  if (date > today(now)) return false;
  if (date >= daysAgo(now, RECENT_DAYS)) return true; // "Latest" and the running season
  const y = yearOfScene(date, e.balanceYear, e.sceneRule);
  return y !== null && y >= FIRST_SENTINEL_YEAR;
}

export async function image(env: Env, deps: Deps, id: string, date: string, style: string, tile: string, orbit: string | null, ip: string): Promise<Response> {
  const e = entryOf(deps, id);
  if (e instanceof Response) return e;
  if (!hasAccounts(env)) return fail(502, 'The relay has no Copernicus credentials yet.');
  if (!(STYLES as readonly string[]).includes(style)) return fail(400, 'style');
  if (orbit !== null && !/^R\d{3}$/.test(orbit)) return fail(400, 'orbit');
  if (!dateAllowed(date, e, deps.now())) return fail(400, 'date is outside every scene window of this glacier');
  const grid = imageGrid(e.pictureBox);
  const ti = Number(tile);
  if (!/^\d{1,3}$/.test(tile) || ti >= grid.tiles.length) return fail(400, 'tile');
  const t = grid.tiles[ti]!;
  const now = deps.now();
  const closed = date < daysAgo(now, RECENT_DAYS);
  const key = `img:${await renderFingerprint()}:${id}:${date}:${orbit ?? '-'}:${style}:${ti}`;
  const out = await cached(env, deps, key, closed ? 180 * DAY : DAY, ip, () =>
    callCdse(env, deps.fetch, now, '/api/v1/process', processBody(t, date, style as Style, orbit ?? undefined), 'image/jpeg'));
  if (out instanceof Response) return out;
  if (out.status !== 200) return fail(out.status === 429 || out.status === 403 ? 503 : 502, 'Copernicus could not make this picture right now.');
  return new Response(out.data, {
    headers: { 'Content-Type': out.type, 'Cache-Control': closed ? 'public, max-age=31536000, immutable' : 'public, max-age=3600', 'X-Cache': out.hit ? 'HIT' : 'MISS' },
  });
}
