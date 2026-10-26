import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { deps } from './main';
import type { Env } from './relay/env';

const env = { ASSETS: { fetch: async () => new Response('asset') }, ALLOWED_ORIGINS: 'https://tonguesfromspace.org' } as unknown as Env;
const get = (p: string, init: RequestInit = {}) => worker.fetch(new Request('https://x.test' + p, init), env, {});

describe('the Worker entry', () => {
  it('the index holds every published glacier, made from the records', () => {
    const ids = Object.keys(deps.index);
    expect(ids).toContain('aletsch');
    expect(ids).toContain('breidamerkurjokull');
    expect(ids.length).toBe(54);
    expect(deps.index.aletsch).toMatchObject({ region: 'ch', hasScenes: true });
  });
  it('/api/ping answers from the relay by meaning', async () => {
    const r = await get('/api/ping');
    expect(await r.json()).toEqual({ relay: true, glaciers: 54 });
  });
  it('a glacier that is not in the index cannot be asked for', async () => {
    expect((await get('/api/candidates/not-a-glacier/2024')).status).toBe(404);
  });
  it('/cdse/ping still answers from the Worker as it was', async () => {
    const r = await get('/cdse/ping');
    expect(await r.json()).toEqual({ relay: true, managed: true });
  });
  it('the gallery path still reaches the old Worker (and refuses what it should)', async () => {
    expect((await get('/gallery/list')).status).not.toBe(404);
  });
});

describe('"please add this glacier" (/ask/)', () => {
  const store = new Map<string, string>();
  const kv = { get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null), put: async (k: string, v: string) => { store.set(k, v); }, delete: async (k: string) => { store.delete(k); }, list: async () => ({ keys: [...store.keys()].map((name) => ({ name })) }) };
  const askEnv = { ...env, CACHE: kv, TURNSTILE_SECRET: 's', TURNSTILE_SITEKEY: 'k' } as unknown as Env;
  let who = 0;                                                    // a new visitor address per test: the hourly limit is per address
  const post = (body: unknown, e: Env = askEnv) => worker.fetch(new Request('https://x.test/ask/glacier', { method: 'POST', headers: { 'CF-Connecting-IP': 'ip' + who, Origin: 'https://tonguesfromspace.org', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e, {});
  // Wikidata and Turnstile answer from a table: names that are items, and which of them are glaciers
  const answer = (items: Record<string, string>, glaciers: string[], person = true, rgi: Record<string, string> = {}) => vi.stubGlobal('fetch', async (u: string) => {
    if (u.includes('glims.org')) { const f = new URL(u).searchParams.get('cql_filter')!, hit = Object.entries(rgi).filter(([n]) => f.toLowerCase().includes(n.toLowerCase())); return new Response(JSON.stringify({ features: new URL(u).searchParams.get('typeName') === 'GLIMS:RGI_Iceland' ? hit.map(([n, id]) => ({ properties: { NAME: n, GLIMSID: id } })) : [] })); }
    if (u.includes('turnstile')) return new Response(JSON.stringify({ success: person }));
    if (u.includes('wbsearchentities')) { const n = new URL(u).searchParams.get('search')!; return new Response(JSON.stringify({ search: items[n] ? [{ id: items[n], label: n }] : [] })); }
    if (u.includes('sparql')) { const q = new URL(u).searchParams.get('query')!; return new Response(JSON.stringify({ results: { bindings: glaciers.filter((g) => q.includes('wd:' + g)).map((g) => ({ i: { value: 'http://www.wikidata.org/entity/' + g } })) } })); }
    return new Response('?', { status: 500 });
  });
  afterEach(() => { vi.unstubAllGlobals(); store.clear(); who++; });

  it('is closed without storage and the person check', async () => {
    expect(await (await get('/ask/config')).json()).toEqual({ open: false, siteKey: '' });
    expect((await post({ name: 'Kebnekaise Glacier', token: 't' }, env)).status).toBe(503);
  });
  it('keeps a request for a glacier Wikidata knows, one record for every spelling', async () => {
    answer({ 'Kebnekaise Glacier': 'Q1', 'Kebnekaise-gletsjer': 'Q1' }, ['Q1']);
    expect((await post({ name: 'Kebnekaise Glacier', token: 't' })).status).toBe(200);
    expect((await post({ name: 'Kebnekaise-gletsjer', token: 't' })).status).toBe(200);
    expect(JSON.parse(store.get('ask/Q1')!)).toMatchObject({ q: 'Q1', count: 2, typed: ['Kebnekaise Glacier', 'Kebnekaise-gletsjer'] });
  });
  it('also accepts a glacier only the Randolph Glacier Inventory names', async () => {
    answer({}, [], true, { 'Kotajokull': 'G343000E64000N' });
    expect((await post({ name: 'kotajokull', token: 't' })).status).toBe(200);
    expect(JSON.parse(store.get('ask/G343000E64000N')!)).toMatchObject({ label: 'Kotajokull', count: 1 });
    expect((await post({ name: 'Kota', token: 't' })).status).toBe(404);       // a part of a word is not the name
  });
  it('refuses a name that is not a glacier on the list (a mountain, a made-up name)', async () => {
    answer({ Kebnekaise: 'Q2' }, ['Q1']);
    expect((await post({ name: 'Kebnekaise', token: 't' })).status).toBe(404);
    expect((await post({ name: 'Zzzzzz', token: 't' })).status).toBe(404);
    expect(store.size).toBe(0);
  });
  it('refuses a failed person check and a name that is not a name', async () => {
    answer({ 'Kebnekaise Glacier': 'Q1' }, ['Q1'], false);
    expect((await post({ name: 'Kebnekaise Glacier', token: 't' })).status).toBe(403);
    expect((await post({ name: '<script>alert(1)</script>', token: 't' })).status).toBe(400);
    expect(store.size).toBe(0);
  });
});
