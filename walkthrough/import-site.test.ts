import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAll } from './data';
import { loadCtx, progress } from './engine';
import { importSite } from './import-site';

/** On the real data files of the site: the importer is only worth anything if it reads what is really there. */
let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-site-')); process.env.TFS_DATA = join(dir, 'regions'); process.env.TFS_CACHE = join(dir, 'cache'); });
afterAll(() => { delete process.env.TFS_DATA; delete process.env.TFS_CACHE; rmSync(dir, { recursive: true, force: true }); });

describe('import-site', () => {
  it('turns the site data into records for every region and glacier, validated by the schema', () => {
    const r = importSite();
    expect(r.skipped).toEqual([]);
    const { regions, problems, drafts } = loadAll();
    expect(problems).toEqual([]);
    expect(drafts).toEqual([]);      // imported records are published, not drafts
    expect(Object.fromEntries(regions.map((x) => [x.region.id, x.glaciers.length]))).toEqual({ ch: 10, 'is-vatnajokull': 12, 'is-rest': 19, 'no-mainland': 10, 'no-svalbard': 10 });
    const ch = regions.find((x) => x.region.id === 'ch')!.glaciers.map((g) => g.glacier);
    expect(ch.map((g) => g.id)).toContain('aletsch');
    expect(ch.find((g) => g.id === 'sgi-b56-03')?.legacyIds).toEqual(['sgi-B56-03']);      // the id is a slug; the old link keeps working through the legacy id
    expect(ch.find((g) => g.id === 'aletsch')).toMatchObject({ inventoryId: 'B36-26', dataKey: 'B36-26', rank: 1 });
  });

  it('confirms nothing: every step is proposed, and the chain waits for the first one', () => {
    const c = loadCtx('ch', 'aletsch'), p = progress(c);
    expect(p.done).toBe(0);
    const by = Object.fromEntries(p.steps.map((s) => [s.id, s.status]));
    expect(by['region.unit']).toBe('review');
    expect(by['glacier.record']).toBe('blocked');      // waiting for the region, as for any glacier
    expect(c.glacier?.imported?.note).toMatch(/boxes\.js/);
    expect(c.glacier?.recordConfirmation).toBeUndefined();
  });

  it('keeps the site\'s scenes: the Swiss picks as pinned, the Landsat years as proposals, outlines as references', () => {
    const c = loadCtx('ch', 'aletsch');
    expect(Object.keys(c.scenes!.years).length).toBeGreaterThanOrEqual(8);
    expect(c.scenes!.years['2018']).toMatchObject({ status: 'pinned', chosen: { sensor: 'sentinel-2', date: '2018-09-27', orbit: 'R108' } });
    expect(c.outlines!.epochs.map((e) => [e.kind, e.ref?.field])).toEqual([['old', 'oldest.outline'], ['new', 'outline']]);
    const ic = loadCtx('is-vatnajokull', 'breidamerkurjokull');
    expect(ic.scenes!.years['1985']?.chosen?.sensor).toBe('landsat-5');
    expect(ic.outlines!.epochs.map((e) => e.ref?.field)).toEqual(['outlines.lia', 'outlines.latest']);
  });

  it('never overwrites a record a person confirmed', async () => {
    const { confirm, saveCtx } = await import('./engine');
    saveCtx(confirm(loadCtx('ch'), 'region.unit', {}, 'owner', 'read the inventory page', '2026-10-27'));
    saveCtx(confirm(loadCtx('ch', 'aletsch'), 'glacier.record', {}, 'owner', 'name, area and marker are right', '2026-10-27'));
    const again = importSite();
    expect(again.skipped).toEqual(['ch/aletsch: confirmed in the walkthrough, left as it is']);
    expect(again.glaciers).toBe(60);
    const c = loadCtx('ch', 'aletsch');
    expect(c.glacier?.recordConfirmation?.by).toBe('owner');
    expect(c.region.confirmation?.by).toBe('owner');      // the region text a person confirmed is kept too
    expect(progress(c).steps.find((x) => x.id === 'glacier.record')?.status).toBe('done');
  });
});
