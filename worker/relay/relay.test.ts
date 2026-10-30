import { beforeEach, describe, expect, it } from 'vitest';
import { handle } from './index';
import { _resetForTests } from './cdse';
import { _resetUsage } from './cache';
import type { Deps, Env, GlacierIndex } from './env';

const index: GlacierIndex = {
  'test-glacier': {
    region: 'testland', name: 'Test Glacier', hasScenes: true,
    pictureBox: [[46.4, 8.0], [46.5, 8.2]],
    balanceYear: { start: '10-01', end: '09-30', label: 'ends-in', source: 'test' },
    sceneRule: { daysBeforeEnd: 60, daysAfterEnd: 10, maxCloud: 0.05, maxCloudTongue: 0.01, maxSnow: 0.2, fallbackCloud: 0.3, minCoverage: 1, oneOrbit: false, note: 'test' },
  },
};
const NOW = Date.parse('2026-10-22T12:00:00Z');

class FakeKV {
  store = new Map<string, { v: ArrayBuffer; m: unknown }>();
  puts = 0;
  async getWithMetadata(k: string) { const e = this.store.get(k); return { value: e?.v ?? null, metadata: e?.m ?? null }; }
  async put(k: string, v: ArrayBuffer, o: { metadata?: unknown }) { this.puts++; this.store.set(k, { v, m: o.metadata }); }
}

function setup(over: Partial<{ upstream: (url: string, init: RequestInit) => Response; secrets: Record<string, string>; now: number }> = {}) {
  const calls: { url: string; body: any }[] = [];
  const kv = new FakeKV();
  const fetchFake = async (url: any, init: any) => {
    const u = String(url);
    if (u.includes('/token')) return new Response(JSON.stringify({ access_token: 'T', expires_in: 600 }));
    calls.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
    if (over.upstream) return over.upstream(u, init);
    if (u.endsWith('/statistics')) return new Response(JSON.stringify({ data: [] }), { headers: { 'Content-Type': 'application/json' } });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
  };
  const env = { ASSETS: { fetch: async () => new Response('asset') }, CACHE: kv, CDSE_CLIENT_ID: 'a', CDSE_CLIENT_SECRET: 's', ...over.secrets } as unknown as Env;
  const deps: Deps = { index, fetch: fetchFake as typeof fetch, now: () => over.now ?? NOW };
  const get = (path: string, ip = '1.1.1.1') => handle(new Request('https://x.test' + path, { headers: { 'CF-Connecting-IP': ip } }), env, deps);
  return { env, deps, get, calls, kv };
}

beforeEach(() => { _resetForTests(); _resetUsage(); });

describe('image relay', () => {
  it('builds the Copernicus request itself from the glacier record', async () => {
    const { get, calls } = setup();
    const r = await get('/api/image/test-glacier/2025-09-28/natural/0?orbit=R108');
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('image/jpeg');
    const body = calls[0]!.body;
    expect(body.input.data[0].type).toBe('sentinel-2-l1c');
    expect(body.input.data[0].dataFilter.timeRange.from).toBe('2025-09-28T00:00:00Z');
    expect(body.evalscript).toContain('_R108_');
    expect(body.output.width).toBeGreaterThan(1000);
  });
  it('serves the second request from the cache without going upstream', async () => {
    const { get, calls } = setup();
    await get('/api/image/test-glacier/2025-09-28/natural/0');
    const r2 = await get('/api/image/test-glacier/2025-09-28/natural/0');
    expect(r2.headers.get('X-Cache')).toBe('HIT');
    expect(calls).toHaveLength(1);
  });
  it('different colour styles are different cache entries', async () => {
    const { get, calls } = setup();
    await get('/api/image/test-glacier/2025-09-28/natural/0');
    await get('/api/image/test-glacier/2025-09-28/false1/0');
    expect(calls).toHaveLength(2);
  });
  it('past pictures are immutable for a year in the browser', async () => {
    const { get } = setup();
    const r = await get('/api/image/test-glacier/2019-09-28/natural/0');
    expect(r.headers.get('Cache-Control')).toContain('immutable');
  });
  it.each([
    ['unknown glacier', '/api/image/nope/2025-09-28/natural/0', 404],
    ['bad style', '/api/image/test-glacier/2025-09-28/rainbow/0', 400],
    ['tile out of range', '/api/image/test-glacier/2025-09-28/natural/7', 400],
    ['date in no scene window', '/api/image/test-glacier/2019-03-15/natural/0', 400],
    ['date in the future', '/api/image/test-glacier/2027-09-28/natural/0', 400],
    ['impossible date', '/api/image/test-glacier/2025-13-45/natural/0', 400],
    ['bad orbit', '/api/image/test-glacier/2025-09-28/natural/0?orbit=x%22y', 400],
  ])('refuses %s', async (_n, path, status) => {
    const { get, calls } = setup();
    expect((await get(path)).status).toBe(status);
    expect(calls).toHaveLength(0); // nothing reached Copernicus
  });
  it('a scene 5 Oct after the year end is allowed (it closes the year)', async () => {
    const { get } = setup();
    expect((await get('/api/image/test-glacier/2025-10-05/natural/0')).status).toBe(200);
  });
  it('brakes a visitor who asks for too many new pictures, not one who hits the cache', async () => {
    const { get } = setup();
    const dates2024 = Array.from({ length: 61 }, (_, i) => new Date(Date.UTC(2024, 7, 1 + i)).toISOString().slice(0, 10));
    let limited = 0;
    for (const day of dates2024) for (const s of ['natural', 'false1', 'false2', 'false3'])
      if ((await get(`/api/image/test-glacier/${day}/${s}/0`, '9.9.9.9')).status === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
  it('fails over to the next account when one has no processing units left', async () => {
    let n = 0;
    const { get } = setup({
      secrets: { CDSE_CLIENT_ID_2: 'b', CDSE_CLIENT_SECRET_2: 's2' },
      upstream: () => (n++ === 0 ? new Response('{"error":{"code":"INSUFFICIENT_PROCESSING_UNITS"}}', { status: 403 }) : new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'Content-Type': 'image/jpeg' } })),
    });
    expect((await get('/api/image/test-glacier/2025-09-28/natural/0')).status).toBe(200);
  });
  it('does not leak Copernicus error text to visitors', async () => {
    const { get } = setup({ upstream: () => new Response('secret internal detail', { status: 500 }) });
    const r = await get('/api/image/test-glacier/2025-09-28/natural/0');
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain('secret');
  });
  it('without credentials it says so instead of crashing', async () => {
    const { env, deps } = setup();
    delete (env as any).CDSE_CLIENT_ID;
    const r = await handle(new Request('https://x.test/api/image/test-glacier/2025-09-28/natural/0'), env, deps);
    expect(r.status).toBe(502);
  });
});

describe('candidates', () => {
  it('asks Copernicus for exactly the window of the balance year, nothing else', async () => {
    const { get, calls } = setup();
    const r = await get('/api/candidates/test-glacier/2025');
    expect(r.status).toBe(200);
    const tr = calls[0]!.body.aggregation.timeRange;
    expect(tr.from).toBe('2025-08-01T00:00:00Z');
    expect(tr.to).toBe('2025-10-11T00:00:00Z'); // end is the day after the last allowed day (10 Oct)
  });
  it('a closed window ends at its own last day, however late you ask', async () => {
    const { get, calls } = setup();
    await get('/api/candidates/test-glacier/2026');
    expect(calls[0]!.body.aggregation.timeRange.to).toBe('2026-10-11T00:00:00Z');
  });
  it('a running season ends today', async () => {
    const { get, calls } = setup({ now: Date.parse('2026-09-15T12:00:00Z') });
    await get('/api/candidates/test-glacier/2026');
    expect(calls[0]!.body.aggregation.timeRange.to).toBe('2026-09-16T00:00:00Z');
  });
  it('a window that has not opened yet is refused', async () => {
    const { get, calls } = setup({ now: Date.parse('2026-06-15T12:00:00Z') });
    expect((await get('/api/candidates/test-glacier/2026')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it('latest is the last 60 days', async () => {
    const { get, calls } = setup();
    await get('/api/candidates/test-glacier/latest');
    expect(calls[0]!.body.aggregation.timeRange.from).toBe('2026-08-23T00:00:00Z');
  });
  it('refuses silly years', async () => {
    const { get } = setup();
    expect((await get('/api/candidates/test-glacier/1999')).status).toBe(400);
    expect((await get('/api/candidates/test-glacier/2031')).status).toBe(400);
  });
});


describe('routing', () => {
  it('refuses POST on the relay: there is no request body to trust', async () => {
    const { env, deps } = setup();
    expect((await handle(new Request('https://x.test/api/image/test-glacier/2026-09-12/natural/0', { method: 'POST' }), env, deps)).status).toBe(405);
  });
  it('an unknown path is a 404, not the app', async () => {
    const { get } = setup();
    expect((await get('/api/whatever')).status).toBe(404);
  });
});
