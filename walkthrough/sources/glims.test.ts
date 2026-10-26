import { describe, expect, it } from 'vitest';
import { RGI_LAYERS, findByName, glimsOutlines, rgiNear, rgiRegionAt, yearOf } from './glims';

/** The service answers as it did on 26 Oct 2026 (shapes read from real answers); no network. */
const R = 6378137, merc = (lon: number, lat: number) => [(R * lon * Math.PI) / 180, R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))];
const ring = [merc(8.0, 46.4), merc(8.1, 46.4), merc(8.1, 46.5), merc(8.0, 46.5), merc(8.0, 46.4)];
function fake(log: string[] = []) {
  return (async (url: any) => {
    const u = new URL(String(url)), t = u.searchParams.get('typeName')!;
    log.push(`${t} ${u.searchParams.get('cql_filter') ?? u.searchParams.get('bbox') ?? ''}`);
    const body = (crs: string, features: any[]) => new Response(JSON.stringify({ crs: { type: 'name', properties: { name: crs } }, features }));
    if (t === 'GLIMS:glims_gtng_o1regions') return body('urn:ogc:def:crs:EPSG::3857', [{ properties: { RGI_CODE: 11, FULL_NAME: 'Central Europe', WGMS_CODE: 'CEU' } }]);
    if (t.startsWith('GLIMS:RGI_') && (u.searchParams.get('cql_filter') ?? '').startsWith('NAME')) return body('urn:ogc:def:crs:EPSG::3857', t === 'GLIMS:RGI_NewZealand' && /tasman/i.test(u.searchParams.get('cql_filter') ?? '') ? [{ properties: { GLIMSID: 'G170200E43500S', NAME: 'Tasman Glacier', CENLAT: -43.5, CENLON: 170.25 } }] : []);
    if (t === 'GLIMS:RGI_CentralEurope') return body('urn:ogc:def:crs:EPSG::3857', [{ properties: { RGIID: 'RGI60-11.01450', GLIMSID: 'G007993E46510N', NAME: 'Grosser Aletschgletscher', AREA: 81.7, LMAX: 22000, ZMIN: 1560, ZMAX: 4087, CENLAT: 46.5, CENLON: 8.05, BGNDATE: '20030799' }, geometry: { type: 'MultiPolygon', coordinates: [[ring]] } }]);
    if (t === 'GLIMS:GLIMS_Glacier_Outlines') {
      const poly = { type: 'Polygon', coordinates: [[[8.0, 46.4], [8.1, 46.4], [8.1, 46.5], [8.0, 46.4]]] };
      const row = (d: string, by: string) => ({ properties: { glac_id: 'G007993E46510N', glac_name: 'Grosser Aletschgletscher', src_date: d + 'T00:00:00Z', db_area: 90, chief_affl: by }, geometry: poly });
      return body('urn:ogc:def:crs:EPSG::4326', [row('2017-09-01', 'GLAMOS'), row('1850-09-01', 'University of Zurich'), row('1850-09-01', 'University of Zurich'), row('1973-09-01', 'University of Zurich')]);
    }
    return new Response('', { status: 500 });
  }) as unknown as typeof fetch;
}

describe('GLIMS outlines for any place', () => {
  it('names the RGI region of a point and knows its layer', async () => {
    expect(await rgiRegionAt(46.5, 8.0, fake())).toEqual({ code: 11, name: 'Central Europe' });
    expect(RGI_LAYERS[11]).toBe('CentralEurope');
    expect(Object.keys(RGI_LAYERS)).toHaveLength(19);
  });
  it('RGI glaciers near a point come back in lon/lat with the inventory\'s own values', async () => {
    const [g] = await rgiNear(46.5, 8.05, 10, fake());
    expect(g).toMatchObject({ rgiId: 'RGI60-11.01450', glimsId: 'G007993E46510N', name: 'Grosser Aletschgletscher', areaKm2: 81.7, lengthM: 22000, region: 11 });
    const [lon, lat] = g!.geometry.coordinates[0][0][0];
    expect(lon).toBeCloseTo(8.0, 5); expect(lat).toBeCloseTo(46.4, 5);      // Web Mercator in, lon/lat out
    expect(yearOf(g!.date)).toBe(2003);
  });
  it('dated outlines, oldest first, a repeated date of one contributor once', async () => {
    const o = await glimsOutlines('G007993E46510N', fake());
    expect(o.map((x) => x.date)).toEqual(['1850-09-01', '1973-09-01', '2017-09-01']);
  });
  it('a name search is a case-insensitive part of the name, one entry per glacier', async () => {
    const log: string[] = [];
    const r = await findByName('aletsch', fake(log));
    expect(log.some((l) => /glac_name ILIKE '%aletsch%'/.test(l))).toBe(true);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ glimsId: 'G007993E46510N' });
  });
  it('a name only the RGI layers know is found there too', async () => {
    const r = await findByName('tasman', fake());
    expect(r).toContainEqual({ glimsId: 'G170200E43500S', name: 'Tasman Glacier', centre: [-43.5, 170.25] });      // (the fake outline layer answers with its one canned glacier whatever is asked)
  });
  it('refuses a name that tries to be a filter, and an id that is not one', async () => {
    const log: string[] = [];
    await findByName("x' OR '1'='1", fake(log));
    expect(log.join(' ')).not.toMatch(/'1'='1/);
    await expect(glimsOutlines("G1' OR 1=1", fake())).rejects.toThrow(/not a GLIMS id/);
  });
});
