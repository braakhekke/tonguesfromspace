import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './data';
import { boxesObject, check, imageBox, scenesObject, shortName } from './export';
import { importSite } from './import-site';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-exp-')); process.env.TFS_DATA = join(dir, 'regions'); importSite(); });
afterAll(() => { delete process.env.TFS_DATA; rmSync(dir, { recursive: true, force: true }); });

const siteBoxes = () => { const w: any = {}; vm.runInNewContext(readFileSync(join(ROOT, 'data/boxes.js'), 'utf8'), { window: w }); return w.GLACIER_BOXES.glaciers as Record<string, any>; };

describe('export: the records say what the site files say', () => {
  it('round trip: import the site, export again, and data/boxes.js is the same, derived values included', () => {
    const want = boxesObject() as Record<string, any>, have = siteBoxes();
    expect(Object.keys(want).sort()).toEqual(Object.keys(have).sort());
    for (const k of Object.keys(have)) expect(want[k], k).toEqual(have[k]);
  });
  it("round trip: data/scenes.json is the same (the picker's own keys aside: the page reads only the picks)", () => {
    const want = scenesObject() as any, have = JSON.parse(readFileSync(join(ROOT, 'data/scenes.json'), 'utf8'));
    expect(Object.keys(want.glaciers).sort()).toEqual(Object.keys(have.glaciers).sort());
    for (const k of Object.keys(have.glaciers)) { const { savedAt, window, orbit, note, ...rest } = have.glaciers[k]; expect(want.glaciers[k], k).toEqual(rest); }
  });
  it('--check agrees', () => { expect(check()).toEqual([]); });
  it('the page rule for a box: rounded Mercator metres, 10 m ground pixels, at most 2,500 px', () => {
    expect(imageBox([[46.35728576470588, 7.8781889000000005], [46.58120341176471, 8.184029341122477]])).toEqual({ bbox: [876996, 5837791, 911042, 5873982], w: 2345, h: 2493 });
  });
  it('the short name is the page\'s rule', () => {
    expect([shortName('Grosser Aletschgletscher'), shortName('Glacier de Corbassière'), shortName('Fieschergletscher VS')]).toEqual(['Grosser Aletsch', 'Corbassière', 'Fiescher']);
  });
  it('a change in a record shows in --check until the files are exported again', async () => {
    const { loadCtx, saveCtx } = await import('./engine');
    const c = loadCtx('ch', 'aletsch');
    c.glacier!.placement!.pictureBox = [[46.3, 7.9], [46.6, 8.2]];
    saveCtx(c);
    expect(check().join(' ')).toMatch(/data\/boxes\.js differs/);
  });
});
