import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, loadCtx, progress, saveCtx } from './engine';
import { importSite } from './import-site';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-p2-')); process.env.TFS_DATA = join(dir, 'regions'); importSite('ch'); });
afterAll(() => { delete process.env.TFS_DATA; rmSync(dir, { recursive: true, force: true }); });
const status = (id: string) => progress(loadCtx('ch', 'aletsch')).steps.find((s) => s.id === id)!.status;
const ok = (step: string, patch: Record<string, unknown> = {}) => saveCtx(confirm(loadCtx('ch', 'aletsch'), step, patch, 'owner', 'looked at it on the real page', '2026-10-27'));

describe('phase 2: elevation model, 3D strip and start camera', () => {
  it('the strip is standalone: it can be looked at and confirmed while the earlier steps are open; the elevation model still waits for the strip it has to cover', () => {
    expect(status('glacier.strip')).toBe('review');      // not held back by the open record, outline and placement (it stays based on them: it turns stale when they change)
    expect(status('glacier.elevation')).toBe('blocked');
  });
  it('the chain confirms in order, and the strip and camera land in the placement', () => {
    ok('region.unit'); ok('glacier.record');
    const shown = loadCtx('ch', 'aletsch').outlines!.epochs.map((e) => ({ ...e, geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }] } }));      // what the wizard sends back: the referenced outline with its geometry
    ok('glacier.outline', { epochs: shown });
    expect(loadCtx('ch', 'aletsch').outlines!.epochs.every((e) => e.ref && !e.geojson)).toBe(true);
    ok('glacier.placement');
    expect(status('glacier.strip')).toBe('review');      // imported strip, not confirmed
    expect(status('glacier.elevation')).toBe('blocked');      // it has to cover the strip: waits for it
    const cam = { az: 0.1, el: 0.3, dist: 4000 };
    ok('glacier.strip', { strip3d: { azimuth: 47, half: 2100, back: 1000, up: 6500, cam } });
    expect(status('glacier.strip')).toBe('done');
    expect(loadCtx('ch', 'aletsch').glacier!.placement!.strip3d).toMatchObject({ half: 2100, cam });
    expect(status('glacier.elevation')).toBe('todo');      // nothing chosen yet: the person writes it
    ok('glacier.elevation', { model: 'a national model', resolutionM: 2, yearlySurfaces: true, reason: 'Two dated editions (2019 and 2023) cover the strip; read on the source page.' });
    expect(status('glacier.elevation')).toBe('done');
  });
  it('changing the strip does not make the placement stale but does make the elevation model stale (it must cover the strip); changing the placement makes the strip stale too', () => {
    ok('glacier.strip', { strip3d: { azimuth: 50, half: 2000, back: 1000, up: 7000 } });
    expect(status('glacier.placement')).toBe('done');
    expect(status('glacier.elevation')).toBe('stale');
    ok('glacier.elevation', { model: 'a national model', resolutionM: 2, yearlySurfaces: true, reason: 'Two dated editions (2019 and 2023) cover the longer strip; read on the source page.' });
    expect(status('glacier.elevation')).toBe('done');
    const c = loadCtx('ch', 'aletsch'); c.glacier!.placement!.pictureBox = [[46.3, 7.9], [46.6, 8.2]]; saveCtx(c);
    expect(status('glacier.placement')).toBe('stale');
    expect(status('glacier.strip')).toBe('stale');      // standalone: not blocked, but based on the placement, so it is to be looked at again
    expect(status('glacier.elevation')).toBe('blocked');
  });
  it('a reason that says nothing, or yearly surfaces without a year, are refused', () => {
    expect(() => ok('glacier.elevation', { model: 'm', resolutionM: 2, yearlySurfaces: false, reason: 'short' })).toThrow();
  });
});
