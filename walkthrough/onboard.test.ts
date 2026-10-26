import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirm, loadCtx, progress } from './engine';
import { knownSources, onboard, parseSpec } from './onboard';
import { readProposals } from './proposals';

let dir: string;
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'tfs-onb-')); process.env.TFS_DATA = join(dir, 'regions'); process.env.TFS_CACHE = join(dir, 'cache'); });
afterAll(() => { delete process.env.TFS_DATA; delete process.env.TFS_CACHE; rmSync(dir, { recursive: true, force: true }); });

/** GLIMS as it answers (shapes read from real answers of 26 Oct 2026): a big glacier with an old outline, a small unnamed neighbour. */
const R = 6378137, merc = (lon: number, lat: number) => [(R * lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
const sq = (lon: number, lat: number, d: number) => [merc(lon, lat), merc(lon + d, lat), merc(lon + d, lat + d), merc(lon, lat + d), merc(lon, lat)];
function glims(names: Record<string, (string | undefined)[]> = {}) {
  return (async (url: any) => {
    const u = new URL(String(url)), t = u.searchParams.get('typeName')!, cql = u.searchParams.get('cql_filter') ?? '';
    const body = (crs: number, features: any[]) => new Response(JSON.stringify({ crs: { type: 'name', properties: { name: `urn:ogc:def:crs:EPSG::${crs}` } }, features }));
    if (t === 'GLIMS:glims_gtng_o1regions') return body(3857, [{ properties: { RGI_CODE: 18, FULL_NAME: 'New Zealand' } }]);
    const nameQuery = /^NAME ILIKE '%(.*)%'$/.exec(cql)?.[1]?.toLowerCase();
    if (nameQuery !== undefined) {      // the RGI layers asked by name: only the NZ layer has glaciers, and only those whose name contains the text
      if (t !== 'GLIMS:RGI_NewZealand') return body(3857, []);
      return body(3857, [{ properties: { GLIMSID: 'G170200E43500S', NAME: 'Tasman Glacier', CENLAT: -43.5, CENLON: 170.25 } }].filter((x) => x.properties.NAME.toLowerCase().includes(nameQuery)));
    }
    if (t === 'GLIMS:RGI_NewZealand') return body(3857, [
      { properties: { RGIID: 'RGI60-18.02342', GLIMSID: 'G170200E43500S', NAME: 'Tasman Glacier', AREA: 95.216, LMAX: 27000, ZMIN: 700, ZMAX: 3700, CENLAT: -43.5, CENLON: 170.25, BGNDATE: '19780399' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(170.2, -43.55, 0.1)]] } },
      { properties: { RGIID: 'RGI60-18.02375', GLIMSID: 'G170300E43400S', NAME: '', AREA: 4.2, LMAX: 3000, ZMIN: 900, ZMAX: 2500, CENLAT: -43.4, CENLON: 170.3, BGNDATE: '19780399' }, geometry: { type: 'MultiPolygon', coordinates: [[sq(170.3, -43.45, 0.03)]] } },
    ]);
    if (t === 'GLIMS:GLIMS_Glacier_Outlines' && cql.startsWith('glac_name')) {
      const q = /%(.*)%/.exec(cql)![1]!.toLowerCase(), hit = Object.entries(names).filter(([n]) => n.toLowerCase().includes(q));
      return body(4326, hit.flatMap(([n, [lon, lat, id]]) => [{ properties: { glac_id: id ?? `G${n}`, glac_name: n }, geometry: { type: 'Polygon', coordinates: [[[+lon!, +lat!], [+lon! + 0.01, +lat!], [+lon! + 0.01, +lat! + 0.01], [+lon!, +lat!]]] } }]));
    }
    if (t === 'GLIMS:GLIMS_Glacier_Outlines') return body(4326, [['1890-01-01', 'Old survey'], ['1978-03-01', 'RGI source']].map(([d, by]) => ({ properties: { glac_id: 'G170200E43500S', glac_name: 'Tasman Glacier', src_date: d + 'T00:00:00Z', db_area: 120, chief_affl: by }, geometry: { type: 'Polygon', coordinates: [[[170.2, -43.55], [170.3, -43.55], [170.3, -43.45], [170.2, -43.55]]] } })));
    return new Response('', { status: 500 });
  }) as unknown as typeof fetch;
}
const run = (region: string, specs: string[], over: object = {}) => onboard(region, specs.map(parseSpec), { regionName: 'New Zealand', layers: false, open: false, log: () => {}, fetch: glims({ 'Tasman Glacier': ['170.2', '-43.55', 'G170200E43500S'] }), ...over });

describe('onboard: a chat request turns into records, proposals and a window', () => {
  it('reads "name@lat,lon" and a bare name', () => {
    expect(parseSpec('Franz Josef@-43.4678,170.1883')).toEqual({ name: 'Franz Josef', at: [-43.4678, 170.1883] });
    expect(parseSpec('Tasman')).toEqual({ name: 'Tasman', at: null });
  });

  it('a new region and glacier: records exist, nothing is confirmed, every proposal is there', async () => {
    const r = await run('new-zealand', ['Tasman@-43.5,170.25']);
    expect(r.done[0]).toMatchObject({ id: 'tasman', rgiId: 'RGI60-18.02342', areaKm2: 95.216 });      // the glacier the point lies in: the big one, not the small neighbour
    expect(r.url).toMatch(/\/onboard\/new-zealand\/-\/region\.unit$/);      // the region's own step first
    const c = loadCtx('new-zealand', 'tasman');
    expect(c.region.name).toBe('New Zealand');
    expect(c.glacier!.recordConfirmation).toBeUndefined();
    const p = readProposals('new-zealand', 'tasman');
    expect(Object.keys(p).sort()).toEqual(['glacier.outline', 'glacier.placement', 'glacier.record', 'region.unit']);      // no season: no glacier set up anywhere near to copy from
    expect(p['glacier.record']!.data).toMatchObject({ inventoryId: 'RGI60-18.02342', areaKm2: 95.216, areaSource: 'rgi-6', rank: 1 });
    expect(p['glacier.outline']!.data.epochs).toEqual({ new: { year: 1978, source: 'rgi-6' }, old: { year: 1890, source: 'glims' } });
    expect(p['glacier.outline']!.data.candidates.new).toHaveLength(2);      // the neighbour is shown so parts can be added
    expect(p['glacier.placement']!.note).toMatch(/SOUTHERNMOST.*first guess/);
    const [[s, w], [n, e]] = p['glacier.placement']!.data.pictureBox;
    expect(s).toBeLessThan(-43.55); expect(n).toBeGreaterThan(-43.45); expect(w).toBeLessThan(170.2); expect(e).toBeGreaterThan(170.3);
  });

  it('the source licences are NOT READ and the unit rule is a placeholder: the region cannot be confirmed by pressing a button', () => {
    const p = readProposals('new-zealand', null)['region.unit']!;
    expect(p.data.sources.map((s: any) => s.id)).toEqual(['rgi-6', 'glims']);
    expect(p.data.sources.every((s: any) => /^NOT READ/.test(s.licence) && s.commercialUse === false)).toBe(true);
    expect(p.data.unitRule).toMatch(/^TO WRITE/);
    const c = loadCtx('new-zealand');
    expect(() => confirm(c, 'region.unit', p.data, 'owner', 'looked at it', '2026-10-27')).toThrow(/placeholder|NOT READ|licence/i);
  });

  it('a group is ranked by area, the biggest first, whatever order it was asked in', async () => {
    const r = await run('new-zealand', ['Tasman@-43.5,170.25', 'Small one@-43.42,170.31']);
    expect(r.done.map((x) => [x.id, x.areaKm2])).toEqual([['tasman', 95.216], ['small-one', 4.2]]);
    expect(readProposals('new-zealand', 'small-one')['glacier.record']!.data.rank).toBe(2);
  });

  it('says what is wrong instead of guessing: unknown name, ambiguous name, new region without a name', async () => {
    await expect(run('new-zealand', ['Nowhere Glacier'])).rejects.toThrow(/Give its coordinates: "Nowhere Glacier@lat,lon"/);
    await expect(run('new-zealand', ['Twin'], { fetch: glims({ 'Twin A': ['10', '10'], 'Twin B': ['11', '11'] }) })).rejects.toThrow(/matches 2 glaciers.*Choose one/);
    await expect(run('somewhere-new', ['Tasman@-43.5,170.25'], { regionName: undefined })).rejects.toThrow(/--region-name/);
    await expect(run('Bad Id', ['Tasman@-43.5,170.25'])).rejects.toThrow(/not a region id/);
  });

  it('a bare name that GLIMS knows once is found without coordinates', async () => {
    const r = await run('new-zealand', ['Tasman Glacier']);
    expect(r.done[0]!.rgiId).toBe('RGI60-18.02342');
  });

  it('the wizard shows the proposals: the region step is proposed, and the glacier waits for it', () => {
    const steps = Object.fromEntries(progress(loadCtx('new-zealand', 'tasman')).steps.map((s) => [s.id, s.status]));
    expect(steps['region.unit']).toBe('todo');      // nothing in the region record yet: the proposal is the starting point
    expect(steps['glacier.record']).toBe('blocked');
  });

  it('the report names the sources known for the place: a national inventory where there is one, and what cannot be fetched by a program', () => {
    expect(knownSources([[46.5, 8.0]]).join(' ')).toMatch(/GLAMOS.*automatic, better than RGI 6\.0/);
    expect(knownSources([[64.1, -16.3]]).join(' ')).toMatch(/Icelandic Met Office/);
    expect(knownSources([[-43.5, 170.2]]).join(' ')).toMatch(/No national inventory is on the list/);      // New Zealand: only the global ones, so the advice is to look
    expect(knownSources([[-43.5, 170.2]]).join(' ')).toMatch(/Inventory 7\.0.*login/);
  });
});
