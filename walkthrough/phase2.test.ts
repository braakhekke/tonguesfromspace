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
  it('both steps are built and wait for the placement', () => {
    expect(status('glacier.elevation')).toBe('blocked');
    expect(status('glacier.strip')).toBe('blocked');
  });
  it('the chain confirms in order, and the strip and camera land in the placement', () => {
    ok('region.unit'); ok('glacier.record');
    const shown = loadCtx('ch', 'aletsch').outlines!.epochs.map((e) => ({ ...e, geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } }] } }));      // what the wizard sends back: the referenced outline with its geometry
    ok('glacier.outline', { epochs: shown });
    expect(loadCtx('ch', 'aletsch').outlines!.epochs.every((e) => e.ref && !e.geojson)).toBe(true);
    ok('glacier.placement');
    expect(status('glacier.elevation')).toBe('todo');      // nothing chosen yet: the person writes it
    ok('glacier.elevation', { model: 'a national model', resolutionM: 2, yearlySurfaces: true, reason: 'Two dated editions (2019 and 2023) cover the strip; read on the source page.' });
    expect(status('glacier.strip')).toBe('review');      // imported strip, not confirmed
    const cam = { az: 0.1, el: 0.3, dist: 4000 };
    ok('glacier.strip', { strip3d: { azimuth: 47, half: 2100, back: 1000, up: 6500, cam } });
    expect(status('glacier.strip')).toBe('done');
    expect(loadCtx('ch', 'aletsch').glacier!.placement!.strip3d).toMatchObject({ half: 2100, cam });
  });
  it('changing the strip does not make the placement stale; changing the placement makes the strip and elevation stale', () => {
    ok('glacier.strip', { strip3d: { azimuth: 50, half: 2000, back: 1000, up: 7000 } });
    expect(status('glacier.placement')).toBe('done');
    expect(status('glacier.elevation')).toBe('done');
    const c = loadCtx('ch', 'aletsch'); c.glacier!.placement!.pictureBox = [[46.3, 7.9], [46.6, 8.2]]; saveCtx(c);
    expect(status('glacier.placement')).toBe('stale');
    expect(status('glacier.elevation')).toBe('blocked');      // waiting for the placement to be confirmed again
  });
  it('a reason that says nothing, or yearly surfaces without a year, are refused', () => {
    expect(() => ok('glacier.elevation', { model: 'm', resolutionM: 2, yearlySurfaces: false, reason: 'short' })).toThrow();
  });
});
