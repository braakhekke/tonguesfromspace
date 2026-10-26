import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { builtTerrain } from './terrain-build';

function bundle(root: string, id: string, head: object) {
  const hb = Buffer.from(JSON.stringify(head)), len = Buffer.alloc(4);
  len.writeUInt32LE(hb.length);
  mkdirSync(join(root, 'data', 'terrain'), { recursive: true });
  writeFileSync(join(root, 'data', 'terrain', `${id}.abc.bin`), Buffer.concat([Buffer.from('TFS1'), len, hb, Buffer.from([0])]));
  writeFileSync(join(root, 'data', 'terrain', 'manifest.json'), JSON.stringify({ [id]: `${id}.abc.bin` }));
}

describe('the terrain file of a glacier, read back', () => {
  const strip = { azimuth: 90, half: 3800, back: 1500, up: 10000 };
  it('is null without a file', () => expect(builtTerrain('x', strip, mkdtempSync(join(tmpdir(), 'tb-')))).toBeNull());
  it('reports names, source and whether the strip is the record\'s', () => {
    const root = mkdtempSync(join(tmpdir(), 'tb-'));
    bundle(root, 'x', { ue: 1, un: 0, up: 10000, back: 1500, half: 3800, names: [{ text: 'A' }], namesSource: 'OpenStreetMap', built: '2026-10-26', yearly: { years: [2020] } });
    expect(builtTerrain('x', strip, root)).toMatchObject({ names: 1, namesSource: 'OpenStreetMap', yearly: true, matchesStrip: true });
    expect(builtTerrain('x', { ...strip, azimuth: 91 }, root)?.matchesStrip).toBe(false);
    expect(builtTerrain('x', { ...strip, half: 4000 }, root)?.matchesStrip).toBe(false);
  });
  it('reads the verdict of the quality gate, and only for the file it was made on', () => {
    const root = mkdtempSync(join(tmpdir(), 'tb-'));
    bundle(root, 'x', { ue: 1, un: 0, up: 10000, back: 1500, half: 3800, built: '2026-10-26' });
    const q = { file: 'x.abc.bin', status: 'warn', seams: 0.0084, seamsYear: '2015', steep: 0.02, rough: 4, why: ['seams'], relief: ['x-base.png'], strips: [] };
    writeFileSync(join(root, 'data', 'terrain', 'quality.json'), JSON.stringify({ x: q }));
    expect(builtTerrain('x', strip, root)?.quality).toMatchObject({ status: 'warn', relief: ['x-base.png'] });
    writeFileSync(join(root, 'data', 'terrain', 'quality.json'), JSON.stringify({ x: { ...q, file: 'x.old.bin' } }));
    expect(builtTerrain('x', strip, root)?.quality).toBeNull();
  });
});
