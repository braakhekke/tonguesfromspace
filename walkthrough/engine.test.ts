import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAll } from './data';
import { confirm, dependents, loadCtx, newGlacier, newRegion, progress, saveCtx } from './engine';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-')); process.env.TFS_DATA = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.TFS_DATA; });

const source = { id: 'inv', name: 'Inventory', url: 'https://example.org', licence: 'CC BY 4.0', commercialUse: true };
const square = (w: number, s: number, e: number, n: number) => ({ type: 'Feature' as const, properties: { name: 'x' }, geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
/** about 77 km² at 46.4 N: close to the 75.79 km² of the record */
const outline = (features = [square(8.04, 46.36, 8.16, 46.435)]) => ({ epochs: [{ kind: 'new', year: 2023, source: 'inv', geojson: { type: 'FeatureCollection', features } }] });
const status = (c: ReturnType<typeof loadCtx>, id: string) => progress(c).steps.find((s) => s.id === id)!.status;

/** walks the whole of phase 1 for a glacier; returns the saved context */
function walk() {
  let c = newRegion('landx', 'Landx', [46, 8]);
  c = confirm(c, 'region.unit', { unitRule: 'The ten largest glaciers by area in the national inventory.', count: 10, sources: [source] }, 'me', 'checked');
  saveCtx(c);
  c = newGlacier('landx', 'big', 'Big', [46.4, 8.1]);
  c = confirm(c, 'glacier.record', { id: 'big', name: 'Big', inventoryId: 'B-1', rank: 1, areaKm2: 75.79, areaSource: 'inv', centre: [46.4, 8.1] }, 'me', 'checked');
  saveCtx(c);
  c = confirm(c, 'glacier.outline', outline(), 'me', 'followed the ice edge');
  saveCtx(c);
  c = confirm(c, 'glacier.placement', { tip: [46.38, 8.09], pictureBox: [[46.3, 8.0], [46.5, 8.2]] }, 'me', 'looked at the map');
  saveCtx(c);
  c = confirm(c, 'glacier.season', {
    balanceYear: { start: '10-01', end: '09-30', label: 'ends-in', source: 'inventory' },
    sceneRule: { daysBeforeEnd: 60, daysAfterEnd: 10, maxCloud: 0.05, maxCloudTongue: 0.01, maxSnow: 0.2, fallbackCloud: 0.3, minCoverage: 1, oneOrbit: false, note: 'n' },
  }, 'me', 'dates from the inventory');
  saveCtx(c);
  return c;
}

describe('the walkthrough', () => {
  it('starts at the region step and is blocked below it', () => {
    const c = newRegion('landx', 'Landx', [46, 8]);
    const p = progress(c);
    expect(p.next).toBe('region.unit');
  });
  it('every step done is derived from files, with no tracker', () => {
    const w = walk();
    const fresh = loadCtx('landx', 'big'); // read back from disk
    expect(status(fresh, 'region.unit')).toBe('done');
    expect(status(fresh, 'glacier.placement')).toBe('done');
    expect(status(fresh, 'glacier.season')).toBe('done');
    expect(progress(fresh).next).toBe('glacier.scenes');
    expect(status(fresh, 'glacier.outline')).toBe('done');
    expect(w.glacier?.seasonConfirmation?.reason).toBe('dates from the inventory');
  });
  it('a confirmation needs a reason', () => {
    const c = newRegion('landx', 'Landx', [46, 8]);
    expect(() => confirm(c, 'region.unit', { unitRule: 'The ten largest glaciers by area in the inventory.', sources: [source] }, 'me', ' ')).toThrow(/reason/);
  });
  it('changing the picture box makes the season (and everything after) stale', () => {
    walk();
    let c = loadCtx('landx', 'big');
    expect(dependents('glacier.placement', c)).toContain('glacier.season');
    c = confirm(c, 'glacier.placement', { tip: [46.38, 8.09], pictureBox: [[46.3, 8.0], [46.5, 8.25]] }, 'me', 'wider');
    saveCtx(c);
    const fresh = loadCtx('landx', 'big');
    expect(status(fresh, 'glacier.placement')).toBe('done');
    expect(status(fresh, 'glacier.season')).toBe('stale');
    expect(progress(fresh).next).toBe('glacier.season');
  });
  it('a change two levels up reaches the scenes review too', () => {
    walk();
    let c = loadCtx('landx', 'big');
    c = confirm(c, 'glacier.scenes', { years: { '2020': { chosen: { sensor: 'sentinel-2', date: '2020-09-25', orbit: 'R108' }, status: 'approved', discarded: [] } } }, 'me', 'reviewed');
    saveCtx(c);
    expect(status(loadCtx('landx', 'big'), 'glacier.scenes')).toBe('done');
    c = confirm(loadCtx('landx', 'big'), 'glacier.placement', { tip: [46.38, 8.09], pictureBox: [[46.31, 8.0], [46.5, 8.2]] }, 'me', 'moved');
    saveCtx(c);
    const fresh = loadCtx('landx', 'big');
    expect(status(fresh, 'glacier.season')).toBe('stale');
    expect(status(fresh, 'glacier.scenes')).toBe('stale');      // standalone: not blocked by the stale season, but based on it, so it is looked at again
  });
  it('the outline is checked against the area of the record', () => {
    walk();
    const c = loadCtx('landx', 'big');
    expect(() => confirm(c, 'glacier.outline', outline([square(8.04, 46.36, 8.06, 46.38)]), 'me', 'too small')).toThrow(/away from the record/);
  });
  it('picking a different outline marks the placement, season and everything after it stale', () => {
    walk();
    let c = loadCtx('landx', 'big');
    expect(dependents('glacier.outline', c)).toEqual(expect.arrayContaining(['glacier.placement', 'glacier.season']));
    c = confirm(c, 'glacier.outline', outline([square(8.05, 46.36, 8.17, 46.435)]), 'me', 'shifted east');
    saveCtx(c);
    const fresh = loadCtx('landx', 'big');
    expect(status(fresh, 'glacier.outline')).toBe('done');
    expect(status(fresh, 'glacier.placement')).toBe('stale');
    expect(status(fresh, 'glacier.season')).toBe('blocked');
  });
  it('the outline must come from a source of the region', () => {
    const c = walk();
    const bad = outline(); bad.epochs[0]!.source = 'nowhere';
    expect(() => confirm(c, 'glacier.outline', bad, 'me', 'oops')).toThrow(/not a source/);
  });
  it('refuses a tip outside the picture box', () => {
    const c = walk();
    expect(() => confirm(c, 'glacier.placement', { tip: [47.9, 8.09], pictureBox: [[46.3, 8.0], [46.5, 8.2]] }, 'me', 'oops')).toThrow(/outside the picture box/);
  });
  it('a scene below 100 % because its missing data is far from the glacier needs the rule to allow a margin', () => {
    const c = walk();
    const scene = { '2007': { chosen: { sensor: 'landsat-5', date: '2007-09-02', id: 'LT05_x', gaps: 'outside-glacier' }, status: 'approved', discarded: [] } };
    expect(() => confirm(c, 'glacier.scenes', { years: scene }, 'me', 'looked at it')).toThrow(/allows no margin/);
  });
  it('refuses a scene that belongs to another balance year', () => {
    const c = walk();
    expect(() => confirm(c, 'glacier.scenes', { years: { '2021': { chosen: { sensor: 'sentinel-2', date: '2020-09-25' }, status: 'approved', discarded: [] } } }, 'me', 'checked it')).toThrow(/belongs to balance year 2020/);
  });
  it('a scene of 5 October is the year it closes', () => {
    const c = walk();
    const out = confirm(c, 'glacier.scenes', { years: { '2016': { chosen: { sensor: 'sentinel-2', date: '2016-10-05' }, status: 'approved', discarded: [] } } }, 'me', 'late scene, clear');
    expect(out.scenes?.years['2016']?.chosen?.date).toBe('2016-10-05');
  });
  it('unreviewed years keep the review step open', () => {
    const c = walk();
    expect(() => confirm(c, 'glacier.scenes', { years: { '2019': { chosen: { sensor: 'sentinel-2', date: '2019-09-20' }, status: 'auto', discarded: [] } } }, 'me', 'checked it')).toThrow(/not reviewed/);
  });
  it('layers: silence is not allowed', () => {
    const c = walk();
    expect(() => confirm(c, 'glacier.layers', { layers: { basemap: { state: 'enabled', provider: 'inv' } } }, 'me', 'checked it')).toThrow(/has no decision/);
  });
  it('content, About and Sources (phases 3 and 4) are listed but not doable yet; elevation and the 3D strip (phase 2) are', () => {
    const c = walk();
    expect(status(c, 'glacier.content')).toBe('unavailable');
    expect(() => confirm(c, 'glacier.content', {}, 'me', 'checked it')).toThrow(/not built/);
    expect(status(c, 'glacier.elevation')).not.toBe('unavailable');
    expect(status(c, 'glacier.strip')).not.toBe('unavailable');
  });
});

describe('drafts', () => {
  it('a glacier without a confirmed record is a draft: listed, never published, never breaks the build', () => {
    let c = newRegion('landx', 'Landx', [46, 8]);
    c = confirm(c, 'region.unit', { unitRule: 'The ten largest glaciers by area in the inventory.', sources: [source] }, 'me', 'looks right');
    saveCtx(c);
    newGlacier('landx', 'draft-one', 'Draft One', [46, 8]);
    const all = loadAll();
    expect(all.problems).toEqual([]);
    expect(all.drafts).toEqual(['landx/draft-one']);
    expect(all.regions[0]!.glaciers).toHaveLength(0);
  });
});
