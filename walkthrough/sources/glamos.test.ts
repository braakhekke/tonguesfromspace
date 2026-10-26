import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDbf, readShp } from './shapefile';
import { centreOf, featureAreaKm2, idOf, loadInventory, locationOf, fetchInventory, rankByArea, toWgs84 } from './glamos';

/** A polygon shapefile and a dbf, written by hand: one outer ring with a hole, and a Latin-1 value. */
function tinyShapefile() {
  const dir = mkdtempSync(join(tmpdir(), 'tfs-shp-'));
  const outer = [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], hole = [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]];
  const pts = [...outer, ...hole];
  const content = 4 + 32 + 4 + 4 + 8 + 16 * pts.length;
  const b = Buffer.alloc(100 + 8 + content);
  b.writeInt32BE(9994, 0); b.writeInt32BE((b.length) / 2, 24); b.writeInt32LE(1000, 28); b.writeInt32LE(5, 32);
  b.writeInt32BE(1, 100); b.writeInt32BE(content / 2, 104);
  let o = 108; b.writeInt32LE(5, o); o += 36; b.writeInt32LE(2, o); b.writeInt32LE(pts.length, o + 4); b.writeInt32LE(0, o + 8); b.writeInt32LE(outer.length, o + 12); o += 16;
  for (const [x, y] of pts) { b.writeDoubleLE(x!, o); b.writeDoubleLE(y!, o + 8); o += 16; }
  writeFileSync(join(dir, 'a.shp'), b);
  const rec = 1 + 12; const d = Buffer.alloc(32 + 32 + 1 + rec, 0x20);
  d.writeUInt32LE(1, 4); d.writeUInt16LE(32 + 32 + 1, 8); d.writeUInt16LE(rec, 10); d.write('name', 32, 'latin1'); d[32 + 4] = 0; d[32 + 16] = 12; d[64] = 0x0d;
  d.write('Mittelalets\xe4', 65 + 1, 'latin1'); // Latin-1 byte, as in a real GLAMOS value
  writeFileSync(join(dir, 'a.dbf'), d);
  return dir;
}

describe('shapefile reader', () => {
  it('reads an outer ring and its hole as one polygon', () => {
    const polys = readShp(join(tinyShapefile(), 'a.shp'))[0]!;
    expect(polys).toHaveLength(1);
    expect(polys[0]).toHaveLength(2);
  });
  it('reads a dbf and falls back to Latin-1 for a value that is not UTF-8', () => {
    expect(readDbf(join(tinyShapefile(), 'a.dbf'))[0]!.name).toBe('Mittelaletsä');
  });
});

describe('LV95 to WGS84', () => {
  it('the projection origin lands where the CH1903+ definition says (46.95240555555556 N, 7.439583333333333 E, in the Bessel datum)', () => {
    const [lon, lat] = toWgs84(2600000, 1200000);
    expect(lat).toBeCloseTo(46.9510827, 3); // the datum shift moves it about 150 m from the Bessel latitude of the origin
    expect(lon).toBeCloseTo(7.4386324, 3);
  });
});

/** Runs against the real GLAMOS data when it is in the cache (it is downloaded by `npm run onboard -- propose-glamos`). */
const real = await fetchInventory('2023').then(() => true, () => false);
describe.skipIf(!real)('the real Swiss Glacier Inventory 2023', () => {
  it('Grosser Aletschgletscher is B36-26 with the area the file states, and our projection reproduces that area', async () => {
    const all = await loadInventory('2023');
    const f = all.find((g) => idOf(g, '2023') === 'B36-26')!;
    expect(f.properties.name).toBe('Grosser Aletschgletscher');
    expect(f.properties.area_km2).toBe(75.807135);
    const mine = featureAreaKm2(f);
    expect(Math.abs(mine - 75.807135) / 75.807135).toBeLessThan(0.005); // a projection error would show here
    expect(rankByArea(all, f)).toBe(1);
  });
  it('the Aletsch outline and its location point are where Aletsch is', async () => {
    const all = await loadInventory('2023');
    const f = all.find((g) => idOf(g, '2023') === 'B36-26')!;
    const [lat, lon] = centreOf(f);
    expect(lat).toBeGreaterThan(46.4); expect(lat).toBeLessThan(46.6);
    expect(lon).toBeGreaterThan(7.9); expect(lon).toBeLessThan(8.3);
    const dir = await fetchInventory('2023');
    const loc = locationOf('B36-26', dir)!;
    expect(Math.abs(loc[0] - lat)).toBeLessThan(0.15);
  });
  it('the 1850 outline of the same glacier is found by the same id and is larger', async () => {
    const old = (await loadInventory('1850')).find((g) => idOf(g, '1850') === 'B36-26')!;
    expect(featureAreaKm2(old)).toBeGreaterThan(75.8);
    expect(featureAreaKm2(old)).toBeLessThan(115); // Shape_Area in the file is 105.6 km²
  });
});
