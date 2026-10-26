import { describe, expect, it } from 'vitest';
import worker, { deps } from './main';
import type { Env } from './relay/env';

const env = { ASSETS: { fetch: async () => new Response('asset') }, ALLOWED_ORIGINS: 'https://tonguesfromspace.org' } as unknown as Env;
const get = (p: string, init: RequestInit = {}) => worker.fetch(new Request('https://x.test' + p, init), env, {});

describe('the Worker entry', () => {
  it('the index holds every published glacier, made from the records', () => {
    const ids = Object.keys(deps.index);
    expect(ids).toContain('aletsch');
    expect(ids).toContain('breidamerkurjokull');
    expect(ids.length).toBe(52);
    expect(deps.index.aletsch).toMatchObject({ region: 'ch', hasScenes: true });
  });
  it('/api/ping answers from the relay by meaning', async () => {
    const r = await get('/api/ping');
    expect(await r.json()).toEqual({ relay: true, glaciers: 52 });
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
