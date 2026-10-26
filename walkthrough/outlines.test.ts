import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, loadCtx, saveCtx } from './engine';
import { importSite } from './import-site';
import { boxesObject } from './export';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-ol-')); process.env.TFS_DATA = join(dir, 'regions'); importSite('ch'); });
afterAll(() => { delete process.env.TFS_DATA; rmSync(dir, { recursive: true, force: true }); });
const ok = (step: string, patch: Record<string, unknown> = {}) => saveCtx(confirm(loadCtx('ch', 'aletsch'), step, patch, 'owner', 'looked at the outlines on the map', '2026-10-27'));
const poly = { type: 'Polygon' as const, coordinates: [[[8.0, 46.4], [8.1, 46.4], [8.1, 46.5], [8.0, 46.4]]] };
const other = (date: string, by: string) => ({ kind: 'other', year: Number(date.slice(0, 4)), date, by, source: 'glamos-sgi', geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { date, by }, geometry: poly }] } });

describe('more than two outlines of a glacier', () => {
  it('extra dated outlines are kept with the glacier; the two the site draws keep pointing at the data file', () => {
    ok('region.unit'); ok('glacier.record');
    const [old, cur] = loadCtx('ch', 'aletsch').outlines!.epochs;
    ok('glacier.outline', { epochs: [{ ...cur!, geojson: undefined }, { ...old!, geojson: undefined }, other('1927-08-12', 'GLAMOS'), other('2008-09-30', 'University of Fribourg')] });
    const e = loadCtx('ch', 'aletsch').outlines!.epochs;
    expect(e.map((x) => [x.kind, !!x.ref, x.date ?? null])).toEqual([['new', true, null], ['old', true, null], ['other', false, '1927-08-12'], ['other', false, '2008-09-30']]);
    expect(e[2]).toMatchObject({ year: 1927, by: 'GLAMOS', source: 'glamos-sgi' });
  });
  it('an extra outline needs a source of the region, like the others', () => {
    const bad = { ...other('1999-01-01', 'x'), source: 'not-a-source' };
    expect(() => ok('glacier.outline', { epochs: [{ ...loadCtx('ch', 'aletsch').outlines!.epochs[0]!, geojson: undefined }, bad] })).toThrow(/not a source/);
  });
  it('the generated site files do not depend on outlines: extra ones change nothing there', () => {
    const before = JSON.stringify(boxesObject());
    ok('glacier.outline', { epochs: [{ ...loadCtx('ch', 'aletsch').outlines!.epochs[0]!, geojson: undefined }, other('1973-09-01', 'University of Zurich')] });
    expect(JSON.stringify(boxesObject())).toBe(before);
  });
});
