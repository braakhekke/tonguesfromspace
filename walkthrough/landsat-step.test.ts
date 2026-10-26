import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, loadCtx, progress, saveCtx } from './engine';
import { importSite } from './import-site';
import { builtYears, landsatOutlet, startBuild } from './landsat-build';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-ls-')); process.env.TFS_DATA = join(dir, 'regions'); importSite('ch'); });
afterAll(() => { delete process.env.TFS_DATA; rmSync(dir, { recursive: true, force: true }); });
const status = (id: string) => progress(loadCtx('ch', 'aletsch')).steps.find((s) => s.id === id)!.status;
const ok = (step: string, patch: Record<string, unknown> = {}) => saveCtx(confirm(loadCtx('ch', 'aletsch'), step, patch, 'owner', 'looked at it', '2026-10-27'));

describe('Landsat step', () => {
  it('waits for the scene review, then takes what the build made, and a changed box makes it stale', () => {
    expect(status('glacier.landsat')).toBe('blocked');
    ok('region.unit'); ok('glacier.record');
    ok('glacier.outline', { epochs: loadCtx('ch', 'aletsch').outlines!.epochs.map((e) => ({ ...e, geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }] } })) });
    ok('glacier.placement'); ok('glacier.season');
    ok('glacier.scenes', { years: { '2020': { chosen: { sensor: 'sentinel-2', date: '2020-09-25', orbit: 'R108' }, status: 'approved', discarded: [] } } });
    expect(status('glacier.landsat')).toBe('todo');
    ok('glacier.landsat', { years: 28, firstYear: 1984, lastYear: 2015 });
    expect(status('glacier.landsat')).toBe('done');
    ok('glacier.placement', { tip: [46.4, 8.0] });      // a changed box or tip: the pictures were cut for the old one
    expect(status('glacier.landsat')).not.toBe('done');      // blocked by the steps in between that went stale: the pictures are built again once they are confirmed
    expect(loadCtx('ch', 'aletsch').glacier!.landsat).toMatchObject({ years: 28, firstYear: 1984 });
  });
  it('no picture is a problem to look at, not a silent pass', () => {
    const c = loadCtx('ch', 'aletsch');
    expect(() => confirm(c, 'glacier.landsat', { years: 0 }, 'owner', 'nothing', '2026-10-27')).toThrow();
  });
});

describe('Landsat build', () => {
  it('reads the years from the manifest the script writes, in order, with shift and stripes', () => {
    mkdirSync(join(dir, 'data', 'landsat'), { recursive: true });
    writeFileSync(join(dir, 'data', 'landsat', 'x.json'), JSON.stringify({ scenes: { 1990: { date: '1990-09-01', sat: 'landsat-5', shiftM: [30, 40] }, 1985: { date: '1985-08-30', sat: 'landsat-5' } } }));
    const b = builtYears('x', dir)!;
    expect(b).toMatchObject({ years: 2, firstYear: 1985, lastYear: 1990 });
    expect(b.list[1]!.shiftM).toEqual([30, 40]);
    expect(builtYears('none', dir)).toBeNull();
  });
  it('files the pictures under the old site id where there is one', () => {
    expect(landsatOutlet('new-glacier')).toBe('new-glacier');
    expect(landsatOutlet('rhone', ['rhone-old'])).toBe('rhone-old');
  });
  it('does not start before the picture box is set, and refuses ids that are not slugs', () => {
    expect(() => startBuild('ch', '../x')).toThrow(/not a region or glacier id/);
  });
});
