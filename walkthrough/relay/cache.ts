/** Two tiers: the edge cache of the data centre (free, no write quota) and KV (global, survives). */
import type { Env } from './env';

export const sha = async (s: string) => {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
};

type Stored = { type: string; savedAt: number };

export async function kvGet(env: Env, key: string): Promise<{ data: ArrayBuffer; type: string } | null> {
  if (!env.CACHE) return null;
  const r = await env.CACHE.getWithMetadata<Stored>(key, 'arrayBuffer');
  return r.value ? { data: r.value, type: r.metadata?.type ?? 'application/octet-stream' } : null;
}

export async function kvPut(env: Env, key: string, data: ArrayBuffer, type: string, ttlSeconds: number, now: number) {
  if (!env.CACHE) return;
  await env.CACHE.put(key, data, { expirationTtl: Math.max(60, Math.floor(ttlSeconds)), metadata: { type, savedAt: now } satisfies Stored });
}

/** Fair-use brake per visitor for requests that go on to Copernicus (cache hits are free). In memory: a brake, not a wall. */
const usage = new Map<string, number[]>();
export function overLimit(ip: string, now: number, perMin = 90, perHour = 600): boolean {
  const list = (usage.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (list.filter((t) => now - t < 60_000).length >= perMin || list.length >= perHour) { usage.set(ip, list); return true; }
  list.push(now);
  usage.set(ip, list);
  if (usage.size > 5000) for (const [k, v] of usage) if (!v.length || now - (v[v.length - 1] ?? 0) > 3_600_000) usage.delete(k);
  return false;
}
export const _resetUsage = () => usage.clear();

export const shaBytes = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b as unknown as ArrayBuffer))].map((x) => x.toString(16).padStart(2, '0')).join('');
