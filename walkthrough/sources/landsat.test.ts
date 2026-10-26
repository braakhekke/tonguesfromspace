import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { footprintCoverage, protectedMask, qaStats, readNpy, searchLandsat } from './landsat';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-ls-')); process.env.TFS_CACHE = dir; });
afterEach(() => { delete process.env.TFS_CACHE; rmSync(dir, { recursive: true, force: true }); });

const box: [[number, number], [number, number]] = [[46.35729, 7.87819], [46.5812, 8.18403]];
/** a titiler .npy answer: shape (2, h, w) of uint16, the QA band then its mask */
function npy(qa: number[], mask: number[]) {
  const header = `{'descr': '<u2', 'fortran_order': False, 'shape': (2, 2, 2), }`.padEnd(118, ' ') + '\n';
  const b = new Uint8Array(10 + header.length + 2 * (qa.length + mask.length));
  b.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0, header.length & 255, header.length >> 8]);
  b.set(new TextEncoder().encode(header), 10);
  new DataView(b.buffer).setUint16(8, header.length, true);
  [...qa, ...mask].forEach((v, i) => new DataView(b.buffer).setUint16(10 + header.length + 2 * i, v, true));
  return b;
}

describe('the QA band', () => {
  it('counts the cloud bit as cloud, snow as snow, fill as nothing, over the valid pixels only', () => {
    // pixels: clear, cloud (bit 3), snow (bit 5), fill (bit 0)
    const st = qaStats(new Uint16Array([64, 8, 32, 1]), new Uint16Array([255, 255, 255, 255]), 'landsat-5');
    expect(st.cloud).toBeCloseTo(1 / 3); expect(st.snow).toBeCloseTo(1 / 3); expect(st.coverage).toBeCloseTo(0.75);
  });
  it('dilated cloud and cloud shadow are NOT cloud (over mountains the shadow bit is mostly terrain shadow); shadow is reported on its own', () => {
    const st = qaStats(new Uint16Array([2, 16, 64, 64]), new Uint16Array([255, 255, 255, 255]), 'landsat-5');
    expect(st.cloud).toBe(0); expect(st.shadow).toBe(0.25);
  });
  it('cirrus (bit 2) is cloud on Landsat 8 and 9 only', () => {
    expect(qaStats(new Uint16Array([4]), new Uint16Array([255]), 'landsat-8').cloud).toBe(1);
    expect(qaStats(new Uint16Array([4]), new Uint16Array([255]), 'landsat-5').cloud).toBe(0);
  });
  it('masked pixels are outside the picture', () => expect(qaStats(new Uint16Array([64, 64]), new Uint16Array([255, 0]), 'landsat-5').coverage).toBe(0.5));
  it('reads a titiler .npy answer: data band and mask band', () => {
    const { data, mask } = readNpy(npy([5440, 13600, 7440, 1], [255, 255, 255, 0]));
    expect([...data]).toEqual([5440, 13600, 7440, 1]); expect([...mask]).toEqual([255, 255, 255, 0]);
  });
  it('refuses anything that is not what it expects', () => expect(() => readNpy(new Uint8Array(40))).toThrow(/not a .npy/));
});

describe('footprints: 1 means the whole box, exactly', () => {
  const sq = (w: number, s: number, e: number, n: number) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  it('a footprint that misses a thin strip along one edge is NOT full', () => {
    const f = footprintCoverage(box, sq(7, 46, 8.18403 - 0.0008, 47)); // about 60 m of the box is outside
    expect(f).toBeLessThan(1); expect(f).toBeGreaterThan(0.99);
  });
  it('a footprint that misses only one corner is NOT full', () => {
    // a footprint with a slanted edge that cuts off the north-east corner of the box (the other three corners are inside)
    const cut = { type: 'Polygon', coordinates: [[[7, 46], [9, 46], [9, 46.4], [7.6, 46.7], [7, 46.7], [7, 46]]] };
    const f = footprintCoverage(box, cut);
    expect(f).toBeLessThan(1); expect(f).toBeGreaterThan(0.95);
  });
  it('a footprint that holds the whole box is 1', () => expect(footprintCoverage(box, sq(7.87, 46.35, 8.19, 46.59))).toBe(1));
});

describe('footprints', () => {
  const sq = (w: number, s: number, e: number, n: number) => ({ type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
  it('a scene that holds the whole box covers it', () => expect(footprintCoverage(box, sq(7, 46, 9, 47))).toBe(1));
  it('half of the box', () => expect(footprintCoverage(box, sq(7, 46, 8.03, 47))).toBeGreaterThan(0.4));
  it('none of it', () => expect(footprintCoverage(box, sq(10, 46, 11, 47))).toBe(0));
});

describe('searching', () => {
  const feat = (id: string, platform: string, date: string, cloud: number, level = 'l2') => ({ id, properties: { platform, datetime: date + 'T09:40:00Z', 'eo:cloud_cover': cloud, 'landsat:wrs_path': '194', 'landsat:wrs_row': '028' }, geometry: { type: 'Polygon', coordinates: [[[6, 45], [10, 45], [10, 48], [6, 48], [6, 45]]] }, level });
  const stac = (l2: any[], l1: any[]): typeof fetch => async (url: any, init: any) => {
    const u = String(url);
    if (u.includes('/search')) { const col = JSON.parse(init.body).collections[0]; return new Response(JSON.stringify({ features: col === 'landsat-c2-l2' ? l2 : l1 })); }
    return new Response(npy([64, 64, 64, 8], [255, 255, 255, 255]) as unknown as BodyInit); // a quarter of the box under cloud
  };
  it('measures cloud over the BOX, not the scene', async () => {
    const out = await searchLandsat(box, '1984-06-15', '1984-11-30', stac([feat('LT05_a', 'landsat-5', '1984-09-02', 3)], []));
    expect(out[0]).toMatchObject({ sensor: 'landsat-5', date: '1984-09-02', level: 'L2', usable: true, basis: 'box' });
    expect(out[0]!.cloud).toBeCloseTo(0.25);
  });
  it('keeps Level-1 scenes only where Level-2 does not exist, and says why they are not usable', async () => {
    const out = await searchLandsat(box, '1980-06-15', '1984-11-30', stac(
      [feat('LT05_a', 'landsat-5', '1984-09-02', 3)],
      [feat('LT05_L1', 'landsat-5', '1984-09-02', 3), feat('LM03_a', 'landsat-3', '1980-08-10', 10), feat('LT04_a', 'landsat-4', '1983-08-30', 10)]));
    expect(out.map((c) => c.id)).toEqual(['LM03_a', 'LT04_a', 'LT05_a']); // the Level-1 duplicate of the Level-2 scene is gone, sorted by date
    expect(out[0]).toMatchObject({ level: 'L1', usable: false }); expect(out[0]!.why).toMatch(/MSS/);
    expect(out[1]!.why).toMatch(/Level-1 only/);
  });
  it('a scene that covers less than the whole box is listed but cannot be used, and says how much it covers', async () => {
    const part = { ...feat('LT05_p', 'landsat-5', '1984-09-02', 3), geometry: { type: 'Polygon', coordinates: [[[6, 45], [8.03, 45], [8.03, 48], [6, 48], [6, 45]]] } };
    const out = await searchLandsat(box, '1984-06-15', '1984-11-30', stac([part], []));
    expect(out[0]).toMatchObject({ usable: false }); expect(out[0]!.why).toMatch(/covers \d+\.\d % of the picture box; 100 % is required/);
  });
  it('Landsat 7 after the scan-line failure: stripe gaps are the ONE allowed shortfall, as long as the footprint holds the whole box', async () => {
    const gapped: typeof fetch = async (url: any, init: any) => String(url).includes('/search') ? new Response(JSON.stringify({ features: JSON.parse(init.body).collections[0] === 'landsat-c2-l2' ? [feat('LE07_x', 'landsat-7', '2005-09-10', 5)] : [] })) : new Response(npy([64, 1, 64, 64], [255, 0, 255, 255]) as unknown as BodyInit); // one stripe pixel is no-data
    const out = await searchLandsat(box, '2005-06-15', '2005-11-30', gapped);
    expect(out[0]).toMatchObject({ usable: true, gaps: 'slc-off' }); expect(out[0]!.why).toMatch(/stripe gaps/);
    expect(out[0]!.coverage).toBeLessThan(1);
  });
  it('but a Landsat 7 scene whose footprint misses part of the box is NOT allowed, stripes or not', async () => {
    const part = { ...feat('LE07_y', 'landsat-7', '2005-09-10', 5), geometry: { type: 'Polygon', coordinates: [[[6, 45], [8.03, 45], [8.03, 48], [6, 48], [6, 45]]] } };
    const out = await searchLandsat(box, '2005-06-15', '2005-11-30', stac([part], []));
    expect(out[0]).toMatchObject({ usable: false }); expect(out[0]!.gaps).toBeUndefined();
  });
  it('Landsat 7 BEFORE the failure has no stripes, so it needs a full 100 % like everything else', async () => {
    const f: typeof fetch = async (url: any, init: any) => String(url).includes('/search') ? new Response(JSON.stringify({ features: JSON.parse(init.body).collections[0] === 'landsat-c2-l2' ? [feat('LE07_z', 'landsat-7', '2001-08-24', 5)] : [] })) : new Response(npy([64, 1, 64, 64], [255, 0, 255, 255]) as unknown as BodyInit);
    const out = await searchLandsat(box, '2001-06-15', '2001-11-30', f);
    expect(out[0]).toMatchObject({ usable: false });
  });
  it('a scene too cloudy to be worth a measurement is not measured', async () => {
    const out = await searchLandsat(box, '1984-06-15', '1984-11-30', stac([feat('LT05_b', 'landsat-5', '1984-10-27', 92)], []));
    expect(out[0]).toMatchObject({ basis: 'scene' }); expect(out[0]!.cloud).toBeCloseTo(0.92);
  });
  it('falls back to the scene figure when the QA band cannot be read', async () => {
    const f: typeof fetch = async (url: any, init: any) => String(url).includes('/search') ? new Response(JSON.stringify({ features: JSON.parse(init.body).collections[0] === 'landsat-c2-l2' ? [feat('LT05_c', 'landsat-5', '1984-09-02', 3)] : [] })) : new Response('no', { status: 500 });
    const out = await searchLandsat(box, '1984-06-15', '1984-11-30', f);
    expect(out[0]).toMatchObject({ basis: 'scene' });
  }, 20_000);
});


describe('missing data far from the glacier (the allowance)', () => {
  const N = 256;
  // a titiler answer at the real sample size: clear everywhere, no data in the north-west corner (x < 12, y < 40)
  const corner = (gapW = 12, gapH = 40) => {
    const qa = new Array(N * N).fill(64), mask = new Array(N * N).fill(255);
    for (let y = 0; y < gapH; y++) for (let x = 0; x < gapW; x++) mask[y * N + x] = 0;
    const header = `{'descr': '<u2', 'fortran_order': False, 'shape': (2, ${N}, ${N}), }`.padEnd(118, ' ') + '\n';
    const b = new Uint8Array(10 + header.length + 2 * 2 * N * N), dv = new DataView(b.buffer);
    b.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]); dv.setUint16(8, header.length, true); b.set(new TextEncoder().encode(header), 10);
    [...qa, ...mask].forEach((v, i) => dv.setUint16(10 + header.length + 2 * i, v, true));
    return b;
  };
  const feat = { id: 'LT05_edge', properties: { platform: 'landsat-5', datetime: '2007-09-02T09:40:00Z', 'eo:cloud_cover': 3, 'landsat:wrs_path': '194', 'landsat:wrs_row': '028' }, geometry: { type: 'Polygon', coordinates: [[[6, 45], [10, 45], [10, 48], [6, 48], [6, 45]]] } };
  const fetchWith = (b: Uint8Array): typeof fetch => async (url: any, init: any) => String(url).includes('/search') ? new Response(JSON.stringify({ features: JSON.parse(init.body).collections[0] === 'landsat-c2-l2' ? [feat] : [] })) : new Response(b as unknown as BodyInit);
  const around = (lon: number, lat: number, d: number) => ({ type: 'Polygon', coordinates: [[[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d], [lon - d, lat - d]]] });
  const mid = [(box[0][1] + box[1][1]) / 2, (box[0][0] + box[1][0]) / 2] as const;

  it('the protected zone is the outline and its margin, and no more', () => {
    const none = protectedMask(box, [around(mid[0], mid[1], 0.02)], 0), wide = protectedMask(box, [around(mid[0], mid[1], 0.02)], 1000);
    const count = (a: Uint8Array) => a.reduce((x, y) => x + y, 0);
    expect(count(wide)).toBeGreaterThan(count(none) * 1.3);
    expect(wide[0]).toBe(0); expect(wide[N * N - 1]).toBe(0); // the far corners are not protected
    expect(wide[(N / 2) * N + N / 2]).toBe(1);               // the middle is
  });
  it('accepted: the missing corner lies far from a glacier in the middle of the box', async () => {
    const out = await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { outline: [around(mid[0], mid[1], 0.03)], marginM: 1000 });
    expect(out[0]).toMatchObject({ usable: true, gaps: 'outside-glacier', basis: 'box' });
    expect(out[0]!.coverage).toBeLessThan(1); expect(out[0]!.why).toMatch(/more than 1000 m from the glacier outline/);
  });
  it('rejected: the missing corner is within the margin of the glacier', async () => {
    // a glacier whose outline reaches into the north-west corner of the box
    const nw = around(box[0][1] + 0.01, box[1][0] - 0.01, 0.012);
    const out = await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { outline: [nw], marginM: 1000 });
    expect(out[0]).toMatchObject({ usable: false }); expect(out[0]!.gaps).toBeUndefined(); expect(out[0]!.why).toMatch(/within 1000 m of the glacier/);
  });
  it('strict when the margin is 0 or there is no outline', async () => {
    expect((await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { outline: [around(mid[0], mid[1], 0.03)], marginM: 0 }))[0]).toMatchObject({ usable: false });
    expect((await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { marginM: 1000 }))[0]).toMatchObject({ usable: false });
  });
  it('a bigger margin can take the allowance away again', async () => {
    const out = await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { outline: [around(mid[0], mid[1], 0.08)], marginM: 5000 });
    expect(out[0]).toMatchObject({ usable: false }); // the nearest missing pixel is about 4.5 km from this outline: inside a 5 km margin
    const ok = await searchLandsat(box, '2007-06-15', '2007-11-30', fetchWith(corner()), { outline: [around(mid[0], mid[1], 0.08)], marginM: 1000 });
    expect(ok[0]).toMatchObject({ usable: true, gaps: 'outside-glacier' }); // and the same scene passes with a 1 km margin
  });
});
